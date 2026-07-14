/// <reference lib="webworker" />
import {
  InterruptableStoppingCriteria,
  TextStreamer,
  env,
  pipeline,
  type TextGenerationPipeline,
} from "@huggingface/transformers";

// Fetch weights from the Hub, never from our own origin. Left on, the library
// probes `/models/<id>/…` first — and Forge *has* a /models route, so those
// probes hit our own app before falling back.
env.allowLocalModels = false;

/**
 * Runs a Hugging Face model locally, on the user's GPU. Lives in a worker
 * because generation is a tight compute loop — on the main thread it would
 * freeze the tab for the whole reply, taking the stop button with it.
 *
 * One worker, one warm model: the weights are hundreds of MB and take tens of
 * seconds to compile, so loading them per chat would exhaust GPU memory.
 */

export type WorkerRequest =
  | { type: "generate"; id: string; modelId: string; messages: ChatTurn[] }
  | { type: "interrupt" };

export type WorkerResponse =
  | { type: "progress"; id: string; text: string }
  | { type: "token"; id: string; delta: string }
  | { type: "done"; id: string }
  | { type: "error"; id: string; message: string };

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

let generator: TextGenerationPipeline | null = null;
let loadedModelId: string | null = null;
const stopper = new InterruptableStoppingCriteria();

const post = (message: WorkerResponse) => self.postMessage(message);

async function load(modelId: string, id: string) {
  if (generator && loadedModelId === modelId) return generator;

  // Fail fast: on WASM a 0.5B model runs at a few tokens/sec, which is
  // indistinguishable from a hang.
  if (!("gpu" in navigator)) {
    throw new Error(
      "This model needs WebGPU, which this browser doesn't support. Try Chrome or Edge."
    );
  }

  post({ type: "progress", id, text: "Loading model…" });

  // The callback fires per file and per chunk — several files download in
  // parallel, so report only the weights (the one that actually takes time)
  // and only when the whole percentage changes.
  let lastPercent = -1;

  generator = await pipeline("text-generation", modelId, {
    device: "webgpu",
    // NOT q4f16: its fp16 accumulation degrades the KV cache on some GPUs and
    // the model degenerates into loops no matter the sampling settings. q4 is
    // larger (750MB vs 461MB) but numerically stable.
    dtype: "q4",
    progress_callback: (event: unknown) => {
      const p = event as { status?: string; progress?: number; file?: string };

      if (p.status === "ready") {
        post({ type: "progress", id, text: "Preparing model (WebGPU)…" });
        return;
      }
      if (p.status !== "progress" || typeof p.progress !== "number") return;
      if (!p.file?.endsWith(".onnx")) return;

      const percent = Math.floor(p.progress);
      if (percent === lastPercent) return;
      lastPercent = percent;
      post({ type: "progress", id, text: `Downloading weights… ${percent}%` });
    },
  });
  loadedModelId = modelId;
  return generator;
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "interrupt") {
    stopper.interrupt();
    return;
  }

  void (async () => {
    const { id, modelId, messages } = request;
    try {
      const model = await load(modelId, id);
      stopper.reset();

      // The pipeline applies the tokenizer's own chat template to this.
      const streamer = new TextStreamer(model.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (delta: string) => {
          if (delta) post({ type: "token", id, delta });
        },
      });

      // The pipeline detects the chat shape and applies the tokenizer's own
      // template. A system turn anchors it as an assistant rather than a
      // text completer.
      const turns = [
        {
          role: "system" as const,
          content: "You are a helpful assistant. Answer concisely.",
        },
        ...messages,
      ];

      // Greedy decoding makes a 0.5B model loop ("a request is to ask for
      // help" forever). Qwen's own recommended sampling settings, plus a
      // repetition penalty, are what keep it coherent.
      await model(turns, {
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
    } catch (error) {
      post({
        type: "error",
        id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
