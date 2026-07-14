import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";

import { useChatStore } from "@/hooks/use-chat-store";
import { useModal } from "@/hooks/use-modal-store";
import { useModelStore } from "@/hooks/use-model-store";
import { useTokenStore } from "@/hooks/use-token-store";
import type { ChatMessage } from "@/lib/types";

/**
 * Module-level AI SDK Chat instances, one per chat. Living outside React,
 * they keep streaming across navigations; views just subscribe via
 * useChat({ chat }).
 */
const instances = new Map<string, Chat<UIMessage>>();

/** Chats whose turn failed for want of a token, to resend once one is added. */
const awaitingToken = new Set<string>();

/**
 * Re-sends every turn that failed because no token was set. The user message
 * is still on the instance, so a no-arg send resubmits it.
 */
export function retryChatsAwaitingToken() {
  for (const chatId of awaitingToken) {
    void instances.get(chatId)?.sendMessage();
  }
  awaitingToken.clear();
}

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

const CLOSING_TAG = "</think>";

/**
 * A model the server didn't know reasons emits chain-of-thought inline,
 * terminated by </think> with no opening tag — so the server-side extraction
 * can't catch it. Split it out here; the store then flags the model so every
 * later turn streams reasoning properly from the first token.
 */
function splitLeakedReasoning(text: string): {
  content: string;
  reasoning?: string;
} {
  const idx = text.lastIndexOf(CLOSING_TAG);
  if (idx === -1) return { content: text };
  return {
    reasoning: text
      .slice(0, idx)
      .replace(/^\s*<think>\s*/, "")
      .trim(),
    content: text.slice(idx + CLOSING_TAG.length).trimStart(),
  };
}

/** Flattens UI messages (parts) back into the store's plain-text shape. */
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

export function chatInstance(chatId: string): Chat<UIMessage> {
  const existing = instances.get(chatId);
  if (existing) return existing;

  const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
  const modelIdOf = () =>
    useChatStore.getState().chats.find((c) => c.id === chatId)?.modelId;

  const instance = new Chat<UIMessage>({
    id: chatId,
    messages: toUIMessages(chat?.messages ?? []),
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Resolve the model at request time so mid-chat rebinds take effect.
      prepareSendMessagesRequest: ({ messages, body }) => {
        const modelId = modelIdOf();
        const model = useModelStore
          .getState()
          .models.find((m) => m.id === modelId);
        return {
          body: {
            ...body,
            messages,
            modelId,
            provider: model?.provider,
            reasoning: model?.reasoning,
          },
        };
      },
    }),
    onFinish: () => {
      const messages = toChatMessages(instance.messages);
      const last = messages.at(-1);

      // A model whose reasoning leaked into the text is a reasoning model the
      // server didn't know about — flag it so the next turn streams cleanly.
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

      useChatStore.getState().syncMessages(chatId, messages);
    },
    onError: (error) => {
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
