"use client";

import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChatStore } from "@/hooks/use-chat-store";
import { requestMockReply } from "@/lib/mock-assistant";

interface ChatViewProps {
  chatId: string;
}

export function ChatView({ chatId }: ChatViewProps) {
  const chat = useChatStore((state) =>
    state.chats.find((c) => c.id === chatId)
  );
  const sendMessage = useChatStore((state) => state.sendMessage);

  if (!chat) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-lg font-semibold">Chat not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been deleted. Start a new one from the sidebar.
        </p>
      </div>
    );
  }

  const handleSend = (content: string) => {
    if (sendMessage(chat.id, content)) requestMockReply(chat.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {chat.messages.length > 0 ? (
          <MessageList messages={chat.messages} />
        ) : (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-sm text-muted-foreground">
              No messages yet — start the conversation below.
            </p>
          </div>
        )}
      </div>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        <ChatInput onSend={handleSend} autoFocus />
      </div>
    </div>
  );
}
