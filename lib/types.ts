import type { HfTask } from "@/lib/hf-tasks";

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
}

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** Chain-of-thought, rendered in a collapsible panel above the answer. */
  reasoning?: string;
}

export interface Chat {
  id: string;
  title: string;
  updatedAt: string;
  /** Model chosen when the chat was created; pinned until explicitly changed. */
  modelId: string;
  messages: ChatMessage[];
}
