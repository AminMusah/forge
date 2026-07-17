"use client";

import { useEffect } from "react";

import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChatStore } from "@/hooks/use-chat-store";
import { useConversation } from "@/hooks/use-conversation";
import {
  chatModels,
  resolveChatModel,
  useModelStore,
} from "@/hooks/use-model-store";

interface ChatViewProps {
  chatId: string;
}

/** Only mounted once the chat store has hydrated — see ChatPage. */
export function ChatView({ chatId }: ChatViewProps) {
  // Select primitives, not the chat object: the transcript sync replaces that
  // object on every streamed token, and this view reads none of it.
  const exists = useChatStore((state) =>
    state.chats.some((c) => c.id === chatId)
  );
  const modelId = useChatStore(
    (state) => state.chats.find((c) => c.id === chatId)?.modelId
  );

  const { messages, streamingId, isStreaming, send, stop, regenerate } =
    useConversation(chatId);

  // Keep the model chip describing the chat being viewed. Resolved through
  // chatModels so a BYO chat finds its connection — the catalog alone never
  // holds the synthetic model, so this used to leave the chip on whatever was
  // last picked.
  useEffect(() => {
    const model = resolveChatModel(chatModels(), modelId);
    if (model) useModelStore.getState().setModel(model);
  }, [modelId]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {messages.length > 0 ? (
          <MessageList
            messages={messages}
            streamingId={streamingId}
            onRegenerate={regenerate}
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
          onSend={send}
          autoFocus
          attachments
          isStreaming={isStreaming}
          onStop={stop}
          // A chat can only be re-pinned to another chat model — an ASR model
          // would swap this view for one that can't render a conversation.
          task="text-generation"
        />
      </div>
    </div>
  );
}
