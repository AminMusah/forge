"use client";

import { useRouter } from "next/navigation";

import { ChatInput } from "@/components/chat/chat-input";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { startConversation } from "@/lib/conversation";

export function ChatPlaceholder() {
  const router = useRouter();
  const hasHydrated = useChatStore((state) => state.hasHydrated);
  const selectedModel = useModelStore((state) => state.selectedModel);

  const handleSend = (content: string) => {
    // A chat created before rehydration would be overwritten by the stored
    // chats a moment later. Hydration is a mount effect so this is all but
    // impossible, but flush it first rather than risk dropping the message.
    if (!hasHydrated) void useChatStore.persist.rehydrate();
    const chatId = startConversation(content, selectedModel.id);
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
