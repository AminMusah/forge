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
 * A text-generation model opens a real chat at `/c/{id}` (reusing an existing
 * empty chat for that model if one's already there, so repeated clicks don't
 * pile up blanks). A playground task has nothing to type — the descriptor
 * drives generation — so it creates the chat with a default brief and opens
 * straight into the playground, which auto-generates, instead of stranding
 * the user at an empty composer.
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
  const createEmptyChat = useChatStore((state) => state.createEmptyChat);

  return React.useCallback(
    (model: Model) => {
      addModel(model);
      setModel(model);
      if (model.task === "text-generation") {
        // Open a real chat, not the landing page. Reuse an existing empty chat
        // for this model so repeated "Use in chat" clicks don't pile up blanks.
        const existing = useChatStore
          .getState()
          .chats.find((c) => c.modelId === model.id && c.messages.length === 0);
        router.push(`/c/${existing?.id ?? createEmptyChat(model.id)}`);
        return;
      }
      const id = createChat(
        `${taskLabel(model.task)} playground for ${model.name}`,
        model.id
      );
      router.push(`/c/${id}`);
    },
    [router, addModel, setModel, createChat, createEmptyChat]
  );
}
