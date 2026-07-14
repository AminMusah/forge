"use client";

import * as React from "react";
import { Check, Copy, Refresh } from "reicon-react";

import { Markdown } from "@/components/chat/markdown";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { IconSwap } from "@/components/ui/icon-swap";
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
  onRegenerate?: () => void;
}

interface MessageRowProps {
  message: ChatMessage;
  isStreaming: boolean;
  /** Shown under the last assistant message, once it has settled. */
  onRegenerate?: () => void;
}

function MessageActions({
  content,
  onRegenerate,
}: {
  content: string;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Only hidden where hover exists — on touch there is no hover, so the
  // actions stay visible rather than being unreachable.
  return (
    <div className="flex items-center gap-1 transition-opacity duration-150 ease-out focus-within:opacity-100 can-hover:opacity-0 can-hover:group-hover/message-row:opacity-100">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Copy message"
        onClick={() => void copy()}
      >
        <IconSwap showing={copied} on={<Check />} off={<Copy />} />
      </Button>
      {onRegenerate && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Regenerate reply"
          onClick={onRegenerate}
        >
          <Refresh />
        </Button>
      )}
    </div>
  );
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
  onRegenerate,
}: MessageRowProps) {
  // Reasoning ends once the answer starts arriving.
  const isReasoning = isStreaming && !!message.reasoning && !message.content;

  return (
    <MessageScrollerItem
      messageId={message.id}
      scrollAnchor={message.role === "user"}
      className="group/message-row"
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
              {/* Actions only once the reply has settled — copying or
                  regenerating a half-written answer isn't useful. */}
              {!isStreaming && message.content && (
                <MessageActions
                  content={message.content}
                  onRegenerate={onRegenerate}
                />
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
  prev.message.reasoning === next.message.reasoning &&
  prev.onRegenerate === next.onRegenerate);

export function MessageList({
  messages,
  streamingId,
  onRegenerate,
}: MessageListProps) {
  const lastId = messages.at(-1)?.id;

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
                // Only the last reply is regenerable — the SDK truncates the
                // transcript from the regenerated message onward anyway.
                onRegenerate={
                  message.id === lastId && message.role === "assistant"
                    ? onRegenerate
                    : undefined
                }
              />
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
