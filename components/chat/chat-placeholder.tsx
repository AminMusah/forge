"use client";

import { useRouter } from "next/navigation";

import { ChatInput } from "@/components/chat/chat-input";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { chatInstance } from "@/lib/chat-instances";

export function ChatPlaceholder() {
  const router = useRouter();
  const selectedModel = useModelStore((state) => state.selectedModel);
  const createChat = useChatStore((state) => state.createChat);

  const handleSend = (content: string) => {
    const chatId = createChat(content, selectedModel.id);
    // Instance picks up the stored user message; no-arg send submits it.
    void chatInstance(chatId).sendMessage();
    router.push(`/c/${chatId}`);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          How can I help you today?
        </h1>
      </div>
      <div className="w-full max-w-2xl">
        <ChatInput onSend={handleSend} autoFocus />
      </div>
    </div>
  );
}
