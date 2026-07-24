"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "reicon-react";

import { ChatInput } from "@/components/chat/chat-input";
import { Button } from "@/components/ui/button";
import { useOpenModel } from "@/hooks/use-open-model";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { startConversation } from "@/lib/conversation";
import { taskLabel } from "@/lib/hf-tasks";
import { hasWebGPU } from "@/lib/model-cache";
import { isRunnable } from "@/lib/task-support";
import { cn } from "@/lib/utils";
import type { MessageFile, Model } from "@/lib/types";

/**
 * Display order + first-use download size for the demo gallery, smallest
 * download first — the two tiny models (SegFormer, MODNet) load almost
 * instantly and make the strongest first impression; Qwen 0.5B is the
 * slowest and least impressive, so it goes last. A model not listed here
 * (added to the catalog later) falls to the end rather than disappearing —
 * see rankOf below.
 */
const DEMO_ORDER: { id: string; size: string }[] = [
  { id: "Xenova/segformer-b0-finetuned-ade-512-512", size: "4 MB download" },
  { id: "Xenova/modnet", size: "23 MB download" },
  { id: "Xenova/detr-resnet-50", size: "58 MB download" },
  { id: "onnx-community/whisper-base", size: "75 MB download" },
  { id: "Xenova/clip-vit-base-patch32", size: "189 MB download" },
  { id: "onnx-community/Qwen2.5-0.5B-Instruct", size: "483 MB download" },
];

const DEMO_RANK = new Map(DEMO_ORDER.map((d, i) => [d.id, i]));
const DEMO_SIZE = new Map(DEMO_ORDER.map((d) => [d.id, d.size]));

function rankOf(id: string): number {
  return DEMO_RANK.get(id) ?? DEMO_ORDER.length;
}

export function ChatPlaceholder() {
  const router = useRouter();
  const openModel = useOpenModel();
  const hasHydrated = useChatStore((state) => state.hasHydrated);
  const models = useModelStore((state) => state.models);
  const selectedModel = useModelStore((state) => state.selectedModel);
  const setModel = useModelStore((state) => state.setModel);

  // Default view is the claim + gallery; a chat card switches to the composer
  // without leaving this page — text-generation has nowhere else to route to
  // (useOpenModel sends it right back here).
  const [composing, setComposing] = React.useState(false);

  // Optimistic until mounted: hasWebGPU() is false during SSR (no navigator), so
  // reading it during render would prerender every card as unavailable and then
  // flip on hydration — a mismatch, and a bad first impression on the one page
  // that exists to make a good one. Assume available, correct on mount.
  const [webgpu, setWebgpu] = React.useState(true);
  React.useEffect(() => setWebgpu(hasWebGPU()), []);

  const demos = React.useMemo(
    () =>
      models
        .filter((m) => m.runtime === "browser" && isRunnable(m))
        .sort((a, b) => rankOf(a.id) - rankOf(b.id)),
    [models]
  );

  // A chat created before rehydration would be overwritten by the stored chats a
  // moment later. Hydration is a mount effect so this is all but impossible, but
  // flush it first rather than risk dropping the message.
  const flush = () => {
    if (!hasHydrated) void useChatStore.persist.rehydrate();
  };

  const handleSend = (content: string, file?: MessageFile) => {
    flush();
    router.push(`/c/${startConversation(content, selectedModel.id, file)}`);
  };

  const handleCardClick = (model: Model) => {
    if (model.task === "text-generation") {
      // useOpenModel would route text-generation to "/" — this very page — so
      // chat opens inline instead: select it, then switch to the composer.
      setModel(model);
      setComposing(true);
      return;
    }
    openModel(model);
  };

  if (composing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
        <div className="w-full max-w-2xl">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setComposing(false)}
            className="mb-2 gap-1 text-muted-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Back
          </Button>
          {/* No task filter: the home screen deliberately passes none, because
              switching task here is how you get to another surface. */}
          <ChatInput onSend={handleSend} autoFocus attachments />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center gap-8 overflow-y-auto px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Test open models without the setup
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hugging Face models running on your GPU, in the browser. No install, no
          account.
        </p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {demos.map((model) => {
          const unavailable = !webgpu;
          return (
            <button
              key={model.id}
              type="button"
              disabled={unavailable}
              onClick={() => handleCardClick(model)}
              className={cn(
                "flex flex-col gap-1 rounded-lg border bg-card p-4 text-left transition-colors duration-150 ease-out",
                unavailable
                  ? "cursor-default opacity-60"
                  : "hover:bg-muted/40"
              )}
            >
              <span className="text-xs font-medium text-muted-foreground">
                {taskLabel(model.task)}
              </span>
              <span className="text-sm font-semibold">{model.name}</span>
              <span className="text-xs text-muted-foreground">
                {model.description}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {unavailable
                  ? "Needs WebGPU — update your browser (iOS 26+ on iPhone)"
                  : (DEMO_SIZE.get(model.id) ?? "")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
