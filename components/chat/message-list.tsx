"use client";

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

export function MessageList({ messages, streamingId }: MessageListProps) {
  return (
    <MessageScrollerProvider>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.map((message) => {
              // Reasoning ends once the answer starts arriving.
              const isReasoning =
                message.id === streamingId &&
                !!message.reasoning &&
                !message.content;

              return (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  <Message
                    align={message.role === "user" ? "end" : "start"}
                    className="text-sm/relaxed"
                  >
                    <MessageContent>
                      {message.role === "user" ? (
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
                              <ReasoningContent>
                                {message.reasoning}
                              </ReasoningContent>
                            </Reasoning>
                          )}
                          {message.content ? (
                            <p className="whitespace-pre-wrap">
                              {message.content}
                            </p>
                          ) : (
                            !message.reasoning && (
                              <p
                                className="animate-pulse text-muted-foreground"
                                role="status"
                              >
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
            })}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
