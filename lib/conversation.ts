import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";

import { useChatStore } from "@/hooks/use-chat-store";
import { useModal } from "@/hooks/use-modal-store";
import { useModelStore } from "@/hooks/use-model-store";
import { useTokenStore } from "@/hooks/use-token-store";
import { BrowserTransport } from "@/lib/browser-transport";
import { splitLeakedReasoning } from "@/lib/reasoning";
import type { ChatMessage } from "@/lib/types";

/**
 * A conversation is one chat's turn lifecycle: sending, streaming, stopping,
 * regenerating — and every store write those cause. It owns the AI SDK Chat
 * instance (kept outside React so streams survive navigation), the transcript
 * sync, the reasoning-learning rule, and the retry-once-a-token-arrives queue.
 *
 * Callers never see UIMessage, the Chat instance, or the message conversion.
 * The chat store keeps what a turn doesn't cause: titles, recency, rename,
 * delete, model rebinding.
 */
const conversations = new Map<string, Chat<UIMessage>>();

/** Turns that failed for want of a token, resent once one is added. */
const awaitingToken = new Set<string>();

function toUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [
      ...(m.reasoning
        ? [{ type: "reasoning" as const, text: m.reasoning }]
        : []),
      { type: "text" as const, text: m.content },
    ],
  }));
}

/** Flattens UI messages (parts) into the store's plain-text shape. */
export function toChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const text = m.parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
      const reasoning = m.parts
        .map((part) => (part.type === "reasoning" ? part.text : ""))
        .join("");

      if (m.role !== "assistant") {
        return { id: m.id, role: m.role as ChatMessage["role"], content: text };
      }
      // Reasoning parts from the server win; otherwise look for a leak.
      const split = reasoning
        ? { content: text, reasoning }
        : splitLeakedReasoning(text);
      return {
        id: m.id,
        role: "assistant" as const,
        content: split.content,
        reasoning: split.reasoning || undefined,
      };
    });
}

/**
 * The live Chat instance for a chat, created on first use and seeded from the
 * stored transcript. Module-private in spirit — only useConversation should
 * reach for it, so views never handle UIMessage or the instance itself.
 */
export function conversationOf(chatId: string): Chat<UIMessage> {
  const existing = conversations.get(chatId);
  if (existing) return existing;

  const stored = useChatStore.getState().chats.find((c) => c.id === chatId);
  const modelIdOf = () =>
    useChatStore.getState().chats.find((c) => c.id === chatId)?.modelId;

  const modelOf = () =>
    useModelStore.getState().models.find((m) => m.id === modelIdOf());

  // A browser model runs on the user's own GPU; the transport is the only thing
  // that changes — everything downstream is identical either way.
  const model = modelOf();
  const transport =
    model?.runtime === "browser"
      ? new BrowserTransport(model.id, model.dtype)
      : new DefaultChatTransport<UIMessage>({
          api: "/api/chat",
          // Resolve the model at request time so mid-chat rebinds take effect.
          prepareSendMessagesRequest: ({ messages, body }) => {
            const current = modelOf();
            return {
              body: {
                ...body,
                messages,
                modelId: modelIdOf(),
                provider: current?.provider,
                reasoning: current?.reasoning,
              },
            };
          },
        });

  const instance = new Chat<UIMessage>({
    id: chatId,
    messages: toUIMessages(stored?.messages ?? []),
    transport,
    onFinish: () => {
      const messages = toChatMessages(instance.messages);
      const last = messages.at(-1);

      // Reasoning that leaked into the text means the server didn't know this
      // model reasons — flag it so the next turn extracts it properly.
      const modelId = modelIdOf();
      if (modelId && last?.role === "assistant" && last.reasoning) {
        useModelStore.getState().markReasoning(modelId);
      }

      // Router failures that end the stream without an error event leave no
      // assistant text behind — an empty reply is the only symptom.
      if (last?.role !== "assistant" || !last.content) {
        toast.error("The model returned no response", {
          description: "Try sending again, or pick a different model.",
        });
      }

      syncTranscript(chatId, messages);
    },
    onError: (error) => {
      // Browser models need no token — a WebGPU failure must not be mistaken
      // for a missing one.
      if (modelOf()?.runtime === "browser") {
        toast.error("Reply failed", { description: error.message });
        return;
      }

      // A missing token is the one failure with an obvious next step: prompt
      // for it, remember the turn, and resend it once the token lands.
      void useTokenStore
        .getState()
        .refresh()
        .then(() => {
          if (useTokenStore.getState().hasToken) {
            toast.error("Reply failed", { description: error.message });
          } else {
            awaitingToken.add(chatId);
            useModal.getState().onOpen("hfToken");
          }
        });
    },
  });

  conversations.set(chatId, instance);
  return instance;
}

/**
 * Records the transcript as it streams, so a reload mid-reply keeps what
 * arrived. The store write is cheap; its localStorage flush is debounced.
 */
export function syncTranscript(chatId: string, messages: ChatMessage[]) {
  useChatStore.getState().syncMessages(chatId, messages);
}

/**
 * Creates a chat from its first message and sends it — one verb, so callers
 * don't have to know that the store must hold the message before the
 * instance can submit it.
 */
export function startConversation(text: string, modelId: string): string {
  const chatId = useChatStore.getState().createChat(text, modelId);
  // The instance seeds from the store, which now holds the user message; a
  // no-arg send submits exactly that.
  void conversationOf(chatId).sendMessage();
  return chatId;
}

/** Sends a message in an existing conversation. */
export function sendToConversation(chatId: string, text: string) {
  // Recorded in the store for recency and search; the instance owns the stream.
  useChatStore.getState().sendMessage(chatId, text);
  void conversationOf(chatId).sendMessage({ text });
}

/**
 * Re-sends every turn that failed because no token was set. The user message
 * is still on the instance, so a no-arg send resubmits it.
 */
export function retryPendingConversations() {
  for (const chatId of awaitingToken) {
    void conversations.get(chatId)?.sendMessage();
  }
  awaitingToken.clear();
}

/** Stops any in-flight stream and forgets the conversation (chat deleted). */
export function evictConversation(chatId: string) {
  const instance = conversations.get(chatId);
  if (!instance) return;
  void instance.stop();
  conversations.delete(chatId);
}
