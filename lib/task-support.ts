import type { HfTask } from "@/lib/hf-tasks";
import { descriptorFor } from "@/lib/playground/descriptors";
import type { Model } from "@/lib/types";

/**
 * Tasks with a hand-built surface — chat is the ONE. Data, not components, on
 * purpose: /models and the composer need to ask "can Forge run this?" without
 * pulling both chat surfaces (and the codegen SDK behind one of them) into their
 * bundle. task-surface.tsx keys its registry off this same set, so the two can't
 * drift about what's bespoke.
 */
export const BESPOKE_TASKS = new Set<HfTask>(["text-generation"]);

/** Tasks Forge can run today — a bespoke surface, or a descriptor-driven playground. */
export function isSupportedTask(task: HfTask): boolean {
  return BESPOKE_TASKS.has(task) || descriptorFor(task) !== undefined;
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
  if (!BESPOKE_TASKS.has(model.task)) {
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
