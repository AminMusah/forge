"use client";

import { useParams } from "next/navigation";

import { ChatView } from "@/components/chat/chat-view";

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();

  return <ChatView chatId={chatId} />;
}
