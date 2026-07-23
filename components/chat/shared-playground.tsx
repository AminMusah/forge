"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { parseShareFragment } from "@/lib/playground/share";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { taskLabel } from "@/lib/hf-tasks";
import type { HfTask } from "@/lib/hf-tasks";
import type { Model } from "@/lib/types";

/**
 * Opens a `/p` share link: decodes the fragment client-side (never sent to a
 * server), forks it into the recipient's own workspace as a new playground chat
 * seeded with the shared code, and redirects there. The recipient's browser
 * compiles and runs it — nothing is fetched, nothing is billed.
 */
export function SharedPlayground() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return; // StrictMode double-invoke guard
    started.current = true;
    (async () => {
      if (typeof navigator === "undefined" || !("gpu" in navigator)) {
        setError("This playground runs a model on your GPU. Open it in Chrome or Edge.");
        return;
      }
      const payload = await parseShareFragment(window.location.hash);
      if (!payload) {
        setError("This share link is broken or incomplete.");
        return;
      }
      const model: Model = {
        id: payload.modelId,
        name: payload.modelId.split("/").pop() ?? payload.modelId,
        description: "Shared playground",
        task: payload.task as HfTask,
        runtime: "browser",
        dtype: payload.dtype as Model["dtype"],
      };
      useModelStore.getState().addModel(model);
      const title = `${taskLabel(payload.task)} playground for ${model.name}`;
      const id = useChatStore.getState().createSharedChat(title, payload.modelId, payload.code);
      router.replace(`/c/${id}`);
    })();
  }, [router]);

  return (
    <div className="flex h-svh items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {error ?? "Opening shared playground…"}
    </div>
  );
}
