import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";

import { useChatStore } from "@/hooks/use-chat-store";
import type { ChatMessage } from "@/lib/mock-data";

/**
 * Module-level AI SDK Chat instances, one per chat. Living outside React,
 * they keep streaming across navigations (like the mock assistant did);
 * views just subscribe via useChat({ chat }).
 */
const instances = new Map<string, Chat<UIMessage>>();

function toUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text", text: m.content }],
  }));
}

/** Flattens UI messages (parts) back into the store's plain-text shape. */
export function toChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as ChatMessage["role"],
      content: m.parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join(""),
    }));
}

export function chatInstance(chatId: string): Chat<UIMessage> {
  const existing = instances.get(chatId);
  if (existing) return existing;

  const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
  const instance = new Chat<UIMessage>({
    id: chatId,
    messages: toUIMessages(chat?.messages ?? []),
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Resolve modelId at request time so mid-chat rebinds take effect.
      prepareSendMessagesRequest: ({ messages, body }) => ({
        body: {
          ...body,
          messages,
          modelId: useChatStore.getState().chats.find((c) => c.id === chatId)
            ?.modelId,
        },
      }),
    }),
    onFinish: () => {
      useChatStore
        .getState()
        .syncMessages(chatId, toChatMessages(instance.messages));
    },
    onError: (error) => {
      toast.error("Reply failed", { description: error.message });
    },
  });
  instances.set(chatId, instance);
  return instance;
}

/** Stops any in-flight stream and drops the cached instance (chat deleted). */
export function evictChatInstance(chatId: string) {
  const instance = instances.get(chatId);
  if (!instance) return;
  void instance.stop();
  instances.delete(chatId);
}
