"use client";

import { useParams } from "next/navigation";

import { ChatPlaceholder } from "@/components/chat/chat-placeholder";
import { useChatStore } from "@/hooks/use-chat-store";

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const chat = useChatStore((state) =>
    state.chats.find((c) => c.id === chatId)
  );

  return <ChatPlaceholder title={chat?.title ?? "Chat not found"} />;
}
