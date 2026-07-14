/// <reference lib="webworker" />
import {
  InterruptableStoppingCriteria,
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
  // Download and compile ahead of time, so the first message streams at once.
  | { type: "preload"; id: string; modelId: string; dtype: Dtype; task: HfTask }
  | { type: "interrupt" };

export type WorkerResponse =
  | { type: "progress"; id: string; text: string }
  | { type: "token"; id: string; delta: string }
  | { type: "done"; id: string }
  | { type: "error"; id: string; message: string };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

type AnyPipeline = TextGenerationPipeline | AutomaticSpeechRecognitionPipeline;

let model: AnyPipeline | null = null;
let loadedKey: string | null = null;
const stopper = new InterruptableStoppingCriteria();

const post = (message: WorkerResponse) => self.postMessage(message);

/**
 * Whisper's encoder is the small graph and degrades badly when quantized; the
 * decoder is the bulk of the weights and holds up at q4. A single dtype for both
 * is either needlessly large or audibly worse.
 */
function dtypeFor(task: HfTask, dtype: Dtype) {
  if (task === "automatic-speech-recognition") {
    return { encoder_model: "fp32" as const, decoder_model_merged: dtype };
  }
  return dtype;
}

async function load(
  modelId: string,
  dtype: Dtype,
  task: HfTask,
  id: string
): Promise<AnyPipeline> {
  const key = `${task}:${modelId}:${dtype}`;
  if (model && loadedKey === key) return model;

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
  if (model) {
    await model.dispose();
    model = null;
    loadedKey = null;
  }

  post({ type: "progress", id, text: "Loading model…" });

  // The callback fires per file and per chunk. Several files download in
  // parallel — an encoder-decoder ships two graphs — so track them as ONE total
  // rather than reporting each file's own percentage, which lurches backwards
  // when the second file starts.
  const loaded = new Map<string, number>();
  const total = new Map<string, number>();
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

      loaded.set(p.file, p.loaded);
      total.set(p.file, p.total);

      const percent = Math.floor((sum(loaded) / sum(total)) * 100);
      // Monotonic: a file that joins late dilutes the ratio, and a percentage
      // that walks backwards reads as a bug.
      if (percent <= lastPercent) return;
      lastPercent = percent;
      post({ type: "progress", id, text: `Downloading weights… ${percent}%` });
    },
  };

  model =
    task === "automatic-speech-recognition"
      ? await pipeline("automatic-speech-recognition", modelId, options)
      : await pipeline("text-generation", modelId, options);

  loadedKey = key;
  return model;
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

async function transcribe(request: Extract<WorkerRequest, { type: "transcribe" }>) {
  const { id, modelId, dtype, audio } = request;
  const model = (await load(
    modelId,
    dtype,
    "automatic-speech-recognition",
    id
  )) as AutomaticSpeechRecognitionPipeline;

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

async function generate(request: Extract<WorkerRequest, { type: "generate" }>) {
  const { id, modelId, dtype, messages } = request;
  const model = (await load(
    modelId,
    dtype,
    "text-generation",
    id
  )) as TextGenerationPipeline;

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

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "interrupt") {
    stopper.interrupt();
    return;
  }

  void (async () => {
    try {
      switch (request.type) {
        case "preload":
          await load(request.modelId, request.dtype, request.task, request.id);
          post({ type: "done", id: request.id });
          break;
        case "transcribe":
          await transcribe(request);
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
  })();
});
