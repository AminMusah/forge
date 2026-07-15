/// <reference lib="webworker" />
import {
  AutoProcessor,
  AutoTokenizer,
  Florence2ForConditionalGeneration,
  InterruptableStoppingCriteria,
  RawImage,
  TextStreamer,
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type TextGenerationPipeline,
} from "@huggingface/transformers";

import type { HfTask } from "@/lib/hf-tasks";
import type { Dtype } from "@/lib/model-cache";

// Fetch weights from the Hub, never from our own origin. Left on, the library
// probes `/models/<id>/…` first — and Forge *has* a /models route, so those
// probes hit our own app before falling back.
env.allowLocalModels = false;

/**
 * Runs a Hugging Face model locally, on the user's GPU. Lives in a worker
 * because inference is a tight compute loop — on the main thread it would
 * freeze the tab for the whole reply, taking the stop button with it.
 *
 * One worker, one warm model: the weights are hundreds of MB and take tens of
 * seconds to compile, so loading them per chat would exhaust GPU memory. Adding
 * a task means adding a branch here and a surface component — nothing else.
 */

export type WorkerRequest =
  | {
      type: "generate";
      id: string;
      modelId: string;
      dtype: Dtype;
      messages: ChatTurn[];
    }
  // Audio arrives already decoded to 16kHz mono: decodeAudioData lives on
  // AudioContext, which a worker doesn't have.
  | {
      type: "transcribe";
      id: string;
      modelId: string;
      dtype: Dtype;
      audio: Float32Array;
    }
  // An image needs no such help — RawImage decodes a data URL in the worker.
  // `prompt` is the Florence-2 task token that selects caption vs OCR.
  | {
      type: "describe";
      id: string;
      modelId: string;
      dtype: Dtype;
      image: string;
      prompt: string;
    }
  // The generic primitive behind the playground: run ANY pipeline task and hand
  // back its native output. One branch covers object-detection, classification,
  // segmentation… because pipeline() is uniform. This is what a generated UI
  // calls (via the forge bridge) — the agent never writes inference, only the UI
  // that renders `data`.
  | {
      type: "run";
      id: string;
      modelId: string;
      dtype: Dtype;
      task: HfTask;
      input: RunInput;
    }
  // Download and compile ahead of time, so the first message streams at once.
  | { type: "preload"; id: string; modelId: string; dtype: Dtype; task: HfTask }
  | { type: "interrupt" };

/** What a generic run feeds the model. Decoded per `input` presence in the worker. */
export interface RunInput {
  /** A data URL — the worker decodes it to a RawImage. */
  image?: string;
  text?: string;
  /** Passed straight through to the pipeline (e.g. object-detection `threshold`). */
  options?: Record<string, unknown>;
}

export type WorkerResponse =
  | { type: "progress"; id: string; text: string }
  | { type: "token"; id: string; delta: string }
  | { type: "done"; id: string }
  // The whole result at once — a pipeline task's native JSON output. Distinct
  // from `token` (streamed text): a detection result is boxes, not a stream.
  | { type: "result"; id: string; data: unknown }
  | { type: "error"; id: string; message: string };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * What "a loaded model" means depends on the task. Most are a pipeline — but a
 * vision-language model has NO pipeline() in transformers.js at all, so
 * Florence-2 is loaded as its own model class plus the processor and tokenizer
 * that feed it. That asymmetry is a fact about the library, not a shortcut.
 */
/**
 * AutoProcessor is typed as the base Processor, which doesn't declare the two
 * methods Florence-2's own processor adds at runtime. These are what turn a task
 * token into the model's real prompt, and the raw generation back into an answer
 * — so name them rather than casting the whole processor to `any`.
 */
interface Florence2Processor {
  (image: RawImage): Promise<Record<string, unknown>>;
  construct_prompts(task: string): string[];
  /** imageSize is RawImage's own [width, height] tuple. */
  post_process_generation(
    text: string,
    task: string,
    imageSize: [number, number]
  ): Record<string, unknown>;
}

/**
 * A pipeline whose task we don't special-case: object-detection, image
 * classification, and every other uniform pipeline task. Typed as a callable
 * with dispose() rather than `any`, so the generic run() and the eviction path
 * stay honest.
 */
type GenericPipe = {
  (input: unknown, options?: Record<string, unknown>): Promise<unknown>;
  dispose(): Promise<void>;
};

type Loaded =
  | { kind: "text-generation"; pipe: TextGenerationPipeline }
  | { kind: "automatic-speech-recognition"; pipe: AutomaticSpeechRecognitionPipeline }
  | {
      kind: "image-text-to-text";
      model: Florence2ForConditionalGeneration;
      processor: Florence2Processor;
      tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
    }
  | { kind: "pipeline"; task: HfTask; pipe: GenericPipe };

let loaded: Loaded | null = null;
let loadedKey: string | null = null;
const stopper = new InterruptableStoppingCriteria();

const post = (message: WorkerResponse) => self.postMessage(message);

/**
 * Which graphs to quantize, per task.
 *
 * Whisper: the encoder is the small graph and degrades badly quantized; the
 * decoder is the bulk of the weights and holds up at q4.
 *
 * Florence-2: the vision tower and the embedding table stay fp16 — quantizing
 * those is what makes a VLM confidently describe a different picture — while the
 * language encoder/decoder take the dtype. (These are the dtypes HF's own
 * Florence-2 WebGPU demo ships.) Keep in step with weightFiles().
 */
type GraphDtype = Dtype | "fp32";

function dtypeFor(
  task: HfTask,
  dtype: Dtype
): Dtype | Record<string, GraphDtype> {
  if (task === "automatic-speech-recognition") {
    return { encoder_model: "fp32", decoder_model_merged: dtype };
  }
  if (task === "image-text-to-text") {
    return {
      embed_tokens: "fp16",
      vision_encoder: "fp16",
      encoder_model: dtype,
      decoder_model_merged: dtype,
    };
  }
  return dtype;
}

async function load(
  modelId: string,
  dtype: Dtype,
  task: HfTask,
  id: string
): Promise<Loaded> {
  const key = `${task}:${modelId}:${dtype}`;
  if (loaded && loadedKey === key) return loaded;

  // Fail fast: on WASM a 0.5B model runs at a few tokens/sec, which is
  // indistinguishable from a hang.
  if (!("gpu" in navigator)) {
    throw new Error(
      "This model needs WebGPU, which this browser doesn't support. Try Chrome or Edge."
    );
  }

  // One warm model. Swapping tasks (chat → transcribe) evicts the old one
  // explicitly — holding both would double the GPU memory for no benefit, since
  // the user is doing one or the other.
  if (loaded) {
    await (loaded.kind === "image-text-to-text"
      ? loaded.model.dispose()
      : loaded.pipe.dispose());
    loaded = null;
    loadedKey = null;
  }

  post({ type: "progress", id, text: "Loading model…" });

  // The callback fires per file and per chunk. Several files download in
  // parallel — an encoder-decoder ships two graphs — so track them as ONE total
  // rather than reporting each file's own percentage, which lurches backwards
  // when the second file starts.
  const received = new Map<string, number>();
  const expected = new Map<string, number>();
  const sum = (sizes: Map<string, number>) =>
    [...sizes.values()].reduce((bytes, size) => bytes + size, 0);
  let lastPercent = -1;

  const options = {
    device: "webgpu" as const,
    // q4 by default: q4f16's fp16 accumulation degrades the KV cache on some
    // GPUs and the model degenerates into loops no matter the sampling.
    dtype: dtypeFor(task, dtype),
    progress_callback: (event: unknown) => {
      const p = event as {
        status?: string;
        progress?: number;
        file?: string;
        loaded?: number;
        total?: number;
      };

      if (p.status === "ready") {
        post({ type: "progress", id, text: "Preparing model (WebGPU)…" });
        return;
      }
      if (p.status !== "progress" || !p.file?.endsWith(".onnx")) return;
      if (typeof p.loaded !== "number" || !p.total) return;

      received.set(p.file, p.loaded);
      expected.set(p.file, p.total);

      const percent = Math.floor((sum(received) / sum(expected)) * 100);
      // Monotonic: a file that joins late dilutes the ratio, and a percentage
      // that walks backwards reads as a bug.
      if (percent <= lastPercent) return;
      lastPercent = percent;
      post({ type: "progress", id, text: `Downloading weights… ${percent}%` });
    },
  };

  if (task === "image-text-to-text") {
    // No pipeline() for this task — the model class, the image processor and the
    // tokenizer are loaded and driven by hand.
    const [model, processor, tokenizer] = await Promise.all([
      Florence2ForConditionalGeneration.from_pretrained(modelId, options),
      AutoProcessor.from_pretrained(modelId),
      AutoTokenizer.from_pretrained(modelId),
    ]);
    loaded = {
      kind: "image-text-to-text",
      // from_pretrained is typed as its base class; the auto-loader returns the
      // Florence-2 subclass for a Florence-2 config.
      model: model as Florence2ForConditionalGeneration,
      processor: processor as unknown as Florence2Processor,
      tokenizer,
    };
  } else if (task === "automatic-speech-recognition") {
    loaded = {
      kind: "automatic-speech-recognition",
      pipe: await pipeline("automatic-speech-recognition", modelId, options),
    };
  } else if (task === "text-generation") {
    loaded = {
      kind: "text-generation",
      pipe: await pipeline("text-generation", modelId, options),
    };
  } else {
    // Every other pipeline task, loaded generically. `pipeline()` is typed with
    // a literal-union first arg; a runtime-validated HfTask isn't narrowed to it,
    // so cast — the string is a real task name either way.
    loaded = {
      kind: "pipeline",
      task,
      pipe: (await pipeline(
        task as "object-detection",
        modelId,
        options
      )) as unknown as GenericPipe,
    };
  }

  loadedKey = key;
  return loaded!;
}

/**
 * Whisper was trained on subtitles, so silence and background noise come back as
 * caption tags — "[BLANK_AUDIO]", "(upbeat music)" — rather than as nothing.
 * Speech doesn't produce brackets, so what's inside them is an artifact.
 */
function cleanTranscript(text: string): string {
  return text
    .replace(/[[(][^\])]*[\])]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reads an image with Florence-2. The task token in the prompt is what selects
 * the job — the same weights caption, describe or OCR depending on it.
 */
async function describe(request: Extract<WorkerRequest, { type: "describe" }>) {
  const { id, modelId, dtype, image, prompt } = request;
  const model = await load(modelId, dtype, "image-text-to-text", id);
  if (model.kind !== "image-text-to-text") throw new Error("Wrong model loaded.");

  post({ type: "progress", id, text: "Reading image…" });

  // RawImage decodes the data URL here — unlike audio, an image needs no
  // main-thread help.
  const raw = await RawImage.fromURL(image);
  const visionInputs = await model.processor(raw);
  // The processor knows each task's real prompt; the token is a shorthand it
  // expands (<OCR> becomes the model's actual OCR instruction).
  const prompts = model.processor.construct_prompts(prompt);
  const textInputs = model.tokenizer(prompts);

  const output = await model.model.generate({
    ...textInputs,
    ...visionInputs,
    max_new_tokens: 256,
  });

  // Special tokens are KEPT here on purpose: post_process_generation needs them
  // to find the task's answer inside the generated text.
  const decoded = model.tokenizer.batch_decode(output as never, {
    skip_special_tokens: false,
  })[0];

  const result = model.processor.post_process_generation(
    decoded,
    prompt,
    raw.size
  ) as Record<string, unknown>;

  const text = String(result[prompt] ?? "").trim();
  if (!text) throw new Error("The model couldn't read anything in that image.");

  // One shot, presented as a single delta — the transport can't tell.
  post({ type: "token", id, delta: text });
  post({ type: "done", id });
}

async function transcribe(request: Extract<WorkerRequest, { type: "transcribe" }>) {
  const { id, modelId, dtype, audio } = request;
  const loaded = await load(modelId, dtype, "automatic-speech-recognition", id);
  if (loaded.kind !== "automatic-speech-recognition") {
    throw new Error("Wrong model loaded.");
  }
  const model = loaded.pipe;

  post({ type: "progress", id, text: "Transcribing…" });

  const output = await model(audio, {
    // Transcribe, never translate: the transcript has to come back in the
    // language it was spoken in. Left alone, Whisper will render French as
    // English and look like it worked.
    task: "transcribe",
    // Whisper only sees 30 seconds at a time; longer clips are windowed, with an
    // overlap so a word on a seam isn't cut in half.
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  const text = Array.isArray(output)
    ? output.map((chunk) => chunk.text).join(" ")
    : output.text;

  const transcript = cleanTranscript(text ?? "");
  if (!transcript) throw new Error("No speech was found in that audio.");

  // One shot, not a stream — Whisper yields the whole transcript at once. The
  // transport still presents it as a stream, so everything downstream is blind
  // to the difference.
  post({ type: "token", id, delta: transcript });
  post({ type: "done", id });
}

/**
 * The generic inference primitive. Runs any pipeline task and returns its native
 * output verbatim — the shape the descriptor promises the agent. No per-task code
 * here: decoding the input and calling the pipe is uniform.
 */
async function run(request: Extract<WorkerRequest, { type: "run" }>) {
  const { id, modelId, dtype, task, input } = request;
  const loaded = await load(modelId, dtype, task, id);
  if (loaded.kind !== "pipeline") throw new Error("Wrong model loaded.");

  post({ type: "progress", id, text: "Running…" });

  // Decode to what the pipeline expects. RawImage handles a data URL in-worker
  // (no main-thread decode, unlike audio). Text passes straight through.
  const modelInput: unknown = input.image
    ? await RawImage.fromURL(input.image)
    : (input.text ?? "");

  const data = await loaded.pipe(modelInput, input.options ?? {});
  post({ type: "result", id, data });
}

async function generate(request: Extract<WorkerRequest, { type: "generate" }>) {
  const { id, modelId, dtype, messages } = request;
  const loaded = await load(modelId, dtype, "text-generation", id);
  if (loaded.kind !== "text-generation") throw new Error("Wrong model loaded.");
  const model = loaded.pipe;

  stopper.reset();

  // The pipeline applies the tokenizer's own chat template to this.
  const streamer = new TextStreamer(model.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (delta: string) => {
      if (delta) post({ type: "token", id, delta });
    },
  });

  // No system prompt: the server path doesn't add one either, and the
  // tokenizer's own chat template already establishes the assistant role.
  // Greedy decoding makes a small model loop, so sample — with a
  // repetition penalty — using the settings Qwen itself recommends.
  await model(messages, {
    max_new_tokens: 512,
    do_sample: true,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    repetition_penalty: 1.1,
    streamer,
    stopping_criteria: stopper,
  });

  post({ type: "done", id });
}

/**
 * Jobs run one at a time, in order.
 *
 * This worker is shared by chat and by dictation, and it holds ONE warm model —
 * so a job for another task disposes the current one. Running two at once would
 * mean disposing a model mid-generation: press the mic while a browser model is
 * still replying, and the transcribe request would pull the weights out from
 * under the reply. Serialising means a swap can only ever happen between jobs.
 */
let queue: Promise<void> = Promise.resolve();

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  // Not queued: interrupting is what UNBLOCKS the running job, so it must not
  // wait behind it.
  if (request.type === "interrupt") {
    stopper.interrupt();
    return;
  }

  queue = queue.then(async () => {
    try {
      switch (request.type) {
        case "preload":
          await load(request.modelId, request.dtype, request.task, request.id);
          post({ type: "done", id: request.id });
          break;
        case "transcribe":
          await transcribe(request);
          break;
        case "describe":
          await describe(request);
          break;
        case "run":
          await run(request);
          break;
        case "generate":
          await generate(request);
          break;
      }
    } catch (error) {
      post({
        type: "error",
        id: request.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
});
