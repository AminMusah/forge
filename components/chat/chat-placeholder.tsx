"use client";

import { useRouter } from "next/navigation";

import { ChatInput } from "@/components/chat/chat-input";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { requestMockReply } from "@/lib/mock-assistant";

export function ChatPlaceholder() {
  const router = useRouter();
  const selectedModel = useModelStore((state) => state.selectedModel);
  const createChat = useChatStore((state) => state.createChat);

  const handleSend = (content: string) => {
    const chatId = createChat(content, selectedModel.id);
    requestMockReply(chatId);
    router.push(`/c/${chatId}`);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          How can I help you today?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chatting with {selectedModel.name}
        </p>
      </div>
      <div className="w-full max-w-2xl">
        <ChatInput onSend={handleSend} autoFocus />
      </div>
    </div>
  );
}
