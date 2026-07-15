"use client";

import { useRouter } from "next/navigation";

import { ChatInput } from "@/components/chat/chat-input";
import { isSupportedTask } from "@/components/chat/task-surface";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { startConversation } from "@/lib/conversation";

export function ChatPlaceholder() {
  const router = useRouter();
  const hasHydrated = useChatStore((state) => state.hasHydrated);
  const selectedModel = useModelStore((state) => state.selectedModel);

  const task = selectedModel.task;
  // Chat is the one hand-built surface; every other supported task is a generated
  // playground the user describes into being.
  const isPlayground = isSupportedTask(task) && task !== "text-generation";

  // A chat created before rehydration would be overwritten by the stored chats a
  // moment later. Hydration is a mount effect so this is all but impossible, but
  // flush it first rather than risk dropping the message.
  const flush = () => {
    if (!hasHydrated) void useChatStore.persist.rehydrate();
  };

  const handleSend = (content: string) => {
    flush();
    router.push(`/c/${startConversation(content, selectedModel.id)}`);
  };

  // A playground is just a Chat whose replies are generated UIs — create it with
  // the request as its first turn; PlaygroundView generates from there.
  const handleStartPlayground = (content: string) => {
    flush();
    const chatId = useChatStore.getState().createChat(content, selectedModel.id);
    router.push(`/c/${chatId}`);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isPlayground
            ? `Build a playground to test ${selectedModel.name}`
            : "How can I help you today?"}
        </h1>
      </div>

      <div className="w-full max-w-2xl">
        {isPlayground ? (
          <ChatInput
            onSend={handleStartPlayground}
            autoFocus
            task={task}
            placeholder={`Describe the playground — e.g. "let me drop a file and see the model's output"`}
          />
        ) : (
          <ChatInput onSend={handleSend} autoFocus />
        )}
      </div>
    </div>
  );
}
