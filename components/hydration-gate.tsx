"use client";

import * as React from "react";

import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";

/**
 * Both stores skip automatic hydration so the server's empty render can't
 * disagree with the client's stored data. Trigger it once, here, on mount;
 * views gate their own rendering on the stores' hasHydrated flag.
 */
export function HydrationGate() {
  React.useEffect(() => {
    void useModelStore.persist.rehydrate();
    void useChatStore.persist.rehydrate();
  }, []);

  return null;
}
