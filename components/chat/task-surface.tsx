"use client";

import type { ComponentType } from "react";

import { ChatView } from "@/components/chat/chat-view";
import { DescribeView } from "@/components/chat/describe-view";
import { TranscribeView } from "@/components/chat/transcribe-view";
import type { HfTask } from "@/lib/hf-tasks";
import type { Model } from "@/lib/types";
import { isSupportedVisionModel } from "@/lib/vision";

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
  "image-text-to-text": DescribeView,
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

/**
 * Whether Forge can actually run this model — a supported TASK isn't enough.
 * Vision models have no pipeline() to hide behind, so each is driven by hand and
 * only the Florence-2 family is wired up. The Hub offers plenty of others, and
 * offering them here would be a menu of buttons that fail.
 */
export function isRunnable(model: Model): boolean {
  if (!isSupportedTask(model.task)) return false;
  if (model.task === "image-text-to-text") {
    return isSupportedVisionModel(model.id);
  }
  return true;
}

/** Why a model can't be used, for the tooltip on a disabled button. */
export function unrunnableReason(model: Model): string | undefined {
  if (isRunnable(model)) return undefined;
  if (model.task === "image-text-to-text") {
    return "Only Florence-2 models are supported for now";
  }
  return "This task isn't supported yet";
}
