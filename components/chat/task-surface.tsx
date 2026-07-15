"use client";

import type { ComponentType } from "react";

import { ChatView } from "@/components/chat/chat-view";
import { PlaygroundView } from "@/components/chat/playground-view";
import type { HfTask } from "@/lib/hf-tasks";
import { descriptorFor } from "@/lib/playground/descriptors";
import type { Model } from "@/lib/types";

/**
 * Which surface renders a chat, chosen by the task of the model it's pinned to.
 *
 * Chat is the ONE hand-built surface. Every other supported task has a descriptor
 * and renders in the GENERATED PlaygroundView: a new task is no longer a new
 * component, just a descriptor — the agent writes the UI, one PlaygroundView
 * hosts them all.
 */
const surfaces: Partial<Record<HfTask, ComponentType<{ chatId: string }>>> = {
  "text-generation": ChatView,
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
 * Whether Forge can actually run this model — a supported TASK isn't enough. A
 * descriptor-driven playground goes through the browser worker's generic
 * pipeline, so it needs a browser (WebGPU) model; chat handles its own server
 * path. Offering a server model for a playground task would be a button that fails.
 */
export function isRunnable(model: Model): boolean {
  if (!isSupportedTask(model.task)) return false;
  // A descriptor-driven playground runs through the browser worker's generic
  // pipeline, so it needs a browser model. Chat (the one bespoke surface) handles
  // its own server path.
  if (!(model.task in surfaces)) {
    return model.runtime === "browser";
  }
  return true;
}

/** Why a model can't be used, for the tooltip on a disabled button. */
export function unrunnableReason(model: Model): string | undefined {
  if (isRunnable(model)) return undefined;
  if (isSupportedTask(model.task) && model.runtime !== "browser") {
    return "This task only runs on browser (WebGPU) models";
  }
  return "This task isn't supported yet";
}
