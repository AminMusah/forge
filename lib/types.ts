import type { HfTask } from "@/lib/hf-tasks";
import type { Dtype } from "@/lib/model-cache";

export interface Model {
  id: string;
  name: string;
  description: string;
  task: HfTask;
  /**
   * Pinned inference provider (e.g. "featherless-ai"). Set when a model has
   * exactly one live provider — the router's automatic selection can fail
   * for long-tail models, while an explicit provider always resolves.
   */
  provider?: string;
  /**
   * Model emits chain-of-thought before its answer. Seeded from Hub tags
   * (unreliable) and learned the first time a reply contains </think>.
   */
  reasoning?: boolean;
  /**
   * Where the model runs. "browser" models execute locally on the user's GPU
   * via transformers.js — no token, no credits, no network after the weights
   * are cached. Only models with ONNX weights can.
   */
  runtime?: "server" | "browser";
  /**
   * Quantization for a browser model. Defaults to q4: q4f16 is smaller but its
   * fp16 accumulation degrades the KV cache on some GPUs, and the model
   * degenerates into loops regardless of sampling.
   */
  dtype?: Dtype;
  /** Quantizations this model actually ships (from its ONNX files). */
  dtypes?: Dtype[];
}

export type MessageRole = "user" | "assistant";

/** An audio file the user submitted for transcription. */
export interface MessageFile {
  name: string;
  mediaType: string;
  /**
   * The clip itself, as a data URL — held in memory and STRIPPED before the
   * store is persisted (see the chat store's partialize).
   *
   * It must never reach localStorage: that's a ~5MB quota with no pruning, and
   * one base64'd recording would blow it for EVERY chat, not just this one. So
   * a clip survives navigation but not a reload, and `url` is undefined for any
   * message read back from storage — which is exactly what tells the view to
   * hide the player.
   */
  url?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** Chain-of-thought, rendered in a collapsible panel above the answer. */
  reasoning?: string;
  /** Set on a user message that submitted a file (an audio clip to transcribe). */
  file?: MessageFile;
}

export interface Chat {
  id: string;
  title: string;
  updatedAt: string;
  /** Model chosen when the chat was created; pinned until explicitly changed. */
  modelId: string;
  messages: ChatMessage[];
}
