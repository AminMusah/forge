"use client";

import { useParams } from "next/navigation";

import { ChatView } from "@/components/chat/chat-view";
import { useChatStore } from "@/hooks/use-chat-store";

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const hasHydrated = useChatStore((state) => state.hasHydrated);

  // ChatView seeds an AI SDK Chat instance from the store on mount, so it must
  // not render until the stored transcript has been read back.
  if (!hasHydrated) return null;

  return <ChatView chatId={chatId} />;
}
