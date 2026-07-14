"use client";

import type { ComponentType } from "react";

import { ChatView } from "@/components/chat/chat-view";
import { TranscribeView } from "@/components/chat/transcribe-view";
import type { HfTask } from "@/lib/hf-tasks";

/**
 * Which surface renders a chat, chosen by the task of the model it's pinned to.
 * A chat and a transcription share everything beneath this line — the store, the
 * Conversation module, the transport seam — and differ only in how they read.
 *
 * This registry is the extension point for the rest of the workspace: a new task
 * is one worker branch (browser-model.worker.ts), one transport case, and one
 * entry here. Tasks with no entry aren't offered in the first place — /models
 * only lets you pick a model whose task Forge can actually run.
 */
const surfaces: Partial<Record<HfTask, ComponentType<{ chatId: string }>>> = {
  "text-generation": ChatView,
  "automatic-speech-recognition": TranscribeView,
};

export function surfaceFor(
  task: HfTask
): ComponentType<{ chatId: string }> | undefined {
  return surfaces[task];
}

/** Tasks Forge can run today. */
export function isSupportedTask(task: HfTask): boolean {
  return task in surfaces;
}
