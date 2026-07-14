"use client";

import { useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";

import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { chatInstance, toChatMessages } from "@/lib/chat-instances";

interface ChatViewProps {
  chatId: string;
}

/** Only mounted once the chat store has hydrated — see ChatPage. */
export function ChatView({ chatId }: ChatViewProps) {
  const chat = useChatStore((state) =>
    state.chats.find((c) => c.id === chatId)
  );
  const sendMessage = useChatStore((state) => state.sendMessage);

  // Keep the sidebar model selector describing the chat being viewed.
  const modelId = chat?.modelId;
  useEffect(() => {
    const { models, setModel } = useModelStore.getState();
    const model = models.find((m) => m.id === modelId);
    if (model) setModel(model);
  }, [modelId]);

  const instance = useMemo(() => chatInstance(chatId), [chatId]);
  const {
    messages: liveMessages,
    status,
    stop,
    regenerate,
  } = useChat({ chat: instance });
  const isStreaming = status === "streaming" || status === "submitted";

  // Persist as tokens arrive, so a reload mid-reply keeps what streamed rather
  // than losing the turn. The store write is cheap; the localStorage write is
  // debounced inside the store's persist config.
  useEffect(() => {
    if (liveMessages.length === 0) return;
    useChatStore
      .getState()
      .syncMessages(chatId, toChatMessages(liveMessages));
  }, [chatId, liveMessages]);

  const displayMessages = useMemo(() => {
    const converted = toChatMessages(liveMessages);
    // Placeholder row so MessageList shows "Thinking…" before tokens arrive.
    if (status === "submitted") {
      converted.push({ id: "pending", role: "assistant", content: "" });
    }
    return converted;
  }, [liveMessages, status]);

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
    // Record in the store for recency/search; the instance owns the stream.
    sendMessage(chat.id, content);
    void instance.sendMessage({ text: content });
  };

  const handleRegenerate = () => {
    void regenerate();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {displayMessages.length > 0 ? (
          <MessageList
            messages={displayMessages}
            streamingId={isStreaming ? displayMessages.at(-1)?.id : undefined}
            onRegenerate={handleRegenerate}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-sm text-muted-foreground">
              No messages yet — start the conversation below.
            </p>
          </div>
        )}
      </div>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        <ChatInput
          onSend={handleSend}
          autoFocus
          isStreaming={isStreaming}
          onStop={() => void stop()}
        />
      </div>
    </div>
  );
}
