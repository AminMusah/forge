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
   * Synthetic model backed by the user's BYO chat connection (an
   * OpenAI-compatible endpoint). Routes to /api/chat-byo instead of the HF
   * router. Derived from the chat-provider store, never persisted.
   */
  chatConnection?: boolean;
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

/** A file the user attached to a message (see lib/attachments.ts). */
export interface MessageFile {
  name: string;
  /** What the browser claimed the type was — unreliable for source files. */
  mediaType: string;
  /**
   * The file read as text, inlined into the prompt at send time. Persisted with
   * the chat: it IS the transcript, so dropping it on reload would leave the
   * assistant answering a question no longer on screen. Safe to persist only
   * because extraction is capped (MAX_ATTACHMENT_CHARS) — an uncapped field here
   * would blow the ~5MB localStorage quota for EVERY chat, not just this one.
   */
  text: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** Chain-of-thought, rendered in a collapsible panel above the answer. */
  reasoning?: string;
  /** Set on a user message that attached a file. `content` stays what was typed. */
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
