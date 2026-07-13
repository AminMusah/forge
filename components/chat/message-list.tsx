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
import type { ChatMessage } from "@/lib/mock-data";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <MessageScrollerProvider>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.map((message) => (
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
                    ) : message.content ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <p
                        className="animate-pulse text-muted-foreground"
                        role="status"
                      >
                        Thinking…
                      </p>
                    )}
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
