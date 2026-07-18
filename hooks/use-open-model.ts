"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { taskLabel } from "@/lib/hf-tasks";
import type { Model } from "@/lib/types";

/**
 * Select a model and go where it actually gets used.
 *
 * Chat needs a first message the user types, so it lands on the composer. A
 * playground task has nothing to type — the descriptor drives generation — so it
 * creates the chat with a default brief and opens straight into the playground,
 * which auto-generates, instead of stranding the user at an empty composer.
 *
 * Shared by the search page and the downloads page: "open this model" has to
 * mean the same thing in both, and it stopped meaning the same thing the moment
 * it existed twice.
 */
export function useOpenModel(): (model: Model) => void {
  const router = useRouter();
  const addModel = useModelStore((state) => state.addModel);
  const setModel = useModelStore((state) => state.setModel);
  const createChat = useChatStore((state) => state.createChat);

  return React.useCallback(
    (model: Model) => {
      addModel(model);
      setModel(model);
      if (model.task === "text-generation") {
        router.push("/");
        return;
      }
      const id = createChat(
        `${taskLabel(model.task)} playground for ${model.name}`,
        model.id
      );
      router.push(`/c/${id}`);
    },
    [router, addModel, setModel, createChat]
  );
}
