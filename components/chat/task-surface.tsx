"use client";

import type { ComponentType } from "react";
import dynamic from "next/dynamic";

import { ChatView } from "@/components/chat/chat-view";
import type { HfTask } from "@/lib/hf-tasks";
import { descriptorFor } from "@/lib/playground/descriptors";

// The playground surface carries the whole codegen loop (compile, bridge,
// iframe) and the AI SDK behind it. A text chat is the common path and can
// never render one — don't make it download one.
const PlaygroundView = dynamic(
  () => import("@/components/chat/playground-view").then((m) => m.PlaygroundView),
  { ssr: false }
);

/**
 * Which surface renders a chat, chosen by the task of the model it's pinned to.
 *
 * Chat is the ONE hand-built surface. Every other supported task has a descriptor
 * and renders in the GENERATED PlaygroundView: a new task is no longer a new
 * component, just a descriptor — the agent writes the UI, one PlaygroundView
 * hosts them all.
 *
 * This registry must agree with BESPOKE_TASKS (lib/task-support.ts): a task with
 * a bespoke surface here must be in that set, or the runnable-predicates drift.
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
