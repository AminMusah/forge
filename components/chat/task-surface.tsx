"use client";

import type { ComponentType } from "react";

import { ChatView } from "@/components/chat/chat-view";
import { DescribeView } from "@/components/chat/describe-view";
import { PlaygroundView } from "@/components/chat/playground-view";
import { TranscribeView } from "@/components/chat/transcribe-view";
import type { HfTask } from "@/lib/hf-tasks";
import { descriptorFor } from "@/lib/playground/descriptors";
import type { Model } from "@/lib/types";
import { isSupportedVisionModel } from "@/lib/vision";

/**
 * Which surface renders a chat, chosen by the task of the model it's pinned to.
 *
 * Two kinds of surface: a few HAND-BUILT ones (chat, transcription, image
 * reading), and — for every other task that has a descriptor — the GENERATED
 * PlaygroundView. That's the pivot: a new task is no longer a new component, just
 * a descriptor. The agent writes the UI, one PlaygroundView hosts them all.
 *
 * The hand-built surfaces stay as the reference for what a good playground feels
 * like; over time they can migrate to generated ones too.
 */
const surfaces: Partial<Record<HfTask, ComponentType<{ chatId: string }>>> = {
  "text-generation": ChatView,
  "automatic-speech-recognition": TranscribeView,
  "image-text-to-text": DescribeView,
};

export function surfaceFor(
  task: HfTask
): ComponentType<{ chatId: string }> | undefined {
  // A bespoke surface wins; otherwise any task with a descriptor gets a generated
  // playground.
  return surfaces[task] ?? (descriptorFor(task) ? PlaygroundView : undefined);
}

/** Tasks Forge can run today — a bespoke surface, or a descriptor-driven playground. */
export function isSupportedTask(task: HfTask): boolean {
  return task in surfaces || descriptorFor(task) !== undefined;
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
  // A descriptor-driven playground runs through the browser worker's generic
  // pipeline, so it needs a browser model. Bespoke surfaces (chat) handle their
  // own server path.
  if (!(model.task in surfaces)) {
    return model.runtime === "browser";
  }
  return true;
}

/** Why a model can't be used, for the tooltip on a disabled button. */
export function unrunnableReason(model: Model): string | undefined {
  if (isRunnable(model)) return undefined;
  if (model.task === "image-text-to-text") {
    return "Only Florence-2 models are supported for now";
  }
  if (isSupportedTask(model.task) && model.runtime !== "browser") {
    return "This task only runs on browser (WebGPU) models";
  }
  return "This task isn't supported yet";
}
