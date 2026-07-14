"use client";

import * as React from "react";

import { Markdown } from "@/components/chat/markdown";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ui/reasoning";
import type { ChatMessage } from "@/lib/types";

interface MessageListProps {
  messages: ChatMessage[];
  /** Id of the message currently streaming, if any. */
  streamingId?: string;
}

interface MessageRowProps {
  message: ChatMessage;
  isStreaming: boolean;
}

/**
 * Memoized so a token arriving in the streaming message doesn't re-parse the
 * markdown (and re-highlight the code) of every settled message above it.
 * The comparator compares by value, not reference: the store rebuilds every
 * message object on each token, so reference equality would never hold.
 */
const MessageRow = React.memo(function MessageRow({
  message,
  isStreaming,
}: MessageRowProps) {
  // Reasoning ends once the answer starts arriving.
  const isReasoning = isStreaming && !!message.reasoning && !message.content;

  return (
    <MessageScrollerItem
      messageId={message.id}
      scrollAnchor={message.role === "user"}
    >
      <Message
        align={message.role === "user" ? "end" : "start"}
        className="text-sm/relaxed"
      >
        <MessageContent>
          {message.role === "user" ? (
            // Users type literally — never parse their asterisks as markdown.
            <Bubble variant="muted">
              <BubbleContent className="whitespace-pre-wrap text-sm/relaxed">
                {message.content}
              </BubbleContent>
            </Bubble>
          ) : (
            <div className="flex flex-col gap-2">
              {message.reasoning && (
                <Reasoning isStreaming={isReasoning}>
                  <ReasoningTrigger />
                  <ReasoningContent>{message.reasoning}</ReasoningContent>
                </Reasoning>
              )}
              {message.content ? (
                <Markdown>{message.content}</Markdown>
              ) : (
                !message.reasoning && (
                  <p className="animate-pulse text-muted-foreground" role="status">
                    Thinking…
                  </p>
                )
              )}
            </div>
          )}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
},
(prev, next) =>
  prev.isStreaming === next.isStreaming &&
  prev.message.id === next.message.id &&
  prev.message.content === next.message.content &&
  prev.message.reasoning === next.message.reasoning);

export function MessageList({ messages, streamingId }: MessageListProps) {
  return (
    <MessageScrollerProvider>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                isStreaming={message.id === streamingId}
              />
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
