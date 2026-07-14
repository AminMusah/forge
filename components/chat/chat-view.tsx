"use client";

import { useCallback, useEffect, useMemo } from "react";
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
  // Select primitives, not the chat object: syncMessages replaces that object
  // on every streamed token, so subscribing to it would re-render this view on
  // data it never reads (the transcript comes from the AI SDK instance).
  const exists = useChatStore((state) =>
    state.chats.some((c) => c.id === chatId)
  );
  const modelId = useChatStore(
    (state) => state.chats.find((c) => c.id === chatId)?.modelId
  );
  const sendMessage = useChatStore((state) => state.sendMessage);

  // Keep the sidebar model selector describing the chat being viewed.
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

  // Converted once per token and reused by both the persist effect and the
  // render — this is the hot path, so don't do the work twice.
  const messages = useMemo(() => toChatMessages(liveMessages), [liveMessages]);

  // Persist as tokens arrive, so a reload mid-reply keeps what streamed rather
  // than losing the turn. The store write is cheap; the localStorage write is
  // debounced inside the store's persist config.
  useEffect(() => {
    if (messages.length === 0) return;
    useChatStore.getState().syncMessages(chatId, messages);
  }, [chatId, messages]);

  const displayMessages = useMemo(() => {
    // Placeholder row so MessageList shows "Thinking…" before tokens arrive.
    if (status !== "submitted") return messages;
    return [
      ...messages,
      { id: "pending", role: "assistant" as const, content: "" },
    ];
  }, [messages, status]);

  const handleRegenerate = useCallback(() => {
    void regenerate();
  }, [regenerate]);

  const handleStop = useCallback(() => {
    void stop();
  }, [stop]);

  if (!exists) {
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
    sendMessage(chatId, content);
    void instance.sendMessage({ text: content });
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
          onStop={handleStop}
        />
      </div>
    </div>
  );
}
