"use client";

import { useParams } from "next/navigation";

import { surfaceFor } from "@/components/chat/task-surface";
import { useChatStore } from "@/hooks/use-chat-store";
import { taskForModel } from "@/hooks/use-model-store";
import { taskLabel } from "@/lib/hf-tasks";

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const hasHydrated = useChatStore((state) => state.hasHydrated);
  const modelId = useChatStore(
    (state) => state.chats.find((c) => c.id === chatId)?.modelId
  );

  // The surface seeds an AI SDK Chat instance from the store on mount, so it
  // must not render until the stored transcript has been read back.
  if (!hasHydrated) return null;

  // The chat's own model decides how it reads: a chat gets ChatView, a
  // transcription gets TranscribeView. Unknown chats fall through to ChatView,
  // which owns the "not found" state.
  const task = modelId ? taskForModel(modelId) : "text-generation";
  const Surface = surfaceFor(task);

  if (!Surface) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-lg font-semibold">
          {taskLabel(task)} isn&apos;t supported yet
        </h1>
        <p className="text-sm text-muted-foreground">
          This chat is pinned to a model Forge can&apos;t run. Pick another from
          the model menu.
        </p>
      </div>
    );
  }

  return <Surface chatId={chatId} />;
}
