"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";

import { useChatProviderStore } from "@/hooks/use-chat-provider-store";
import { useChatStore } from "@/hooks/use-chat-store";
import { useChatModels } from "@/hooks/use-model-store";
import {
  conversationOf,
  sendToConversation,
  syncTranscript,
  transcriptOf,
} from "@/lib/conversation";
import { selectTransport, type TransportKind } from "@/lib/transport-kind";
import type { ChatMessage, MessageFile } from "@/lib/types";

/**
 * Everything a conversation's transport is built from, as one primitive — so it
 * can key the instance memo. Both halves are load-bearing, and neither implies
 * the other:
 *
 * - the KIND changes with no rebind when a provider is edited from a cloud URL
 *   to a localhost one (byo → local);
 * - the MODEL changes with no kind change when re-pinning one browser model to
 *   another, and BrowserTransport freezes its model id at construction.
 *
 * Reads the catalog through useChatModels so the synthetic BYO model resolves
 * like any other.
 */
function useTransportIdentity(chatId: string): string {
  const modelId = useChatStore((state) =>
    state.chats.find((c) => c.id === chatId)?.modelId
  );
  const models = useChatModels();
  const baseURL = useChatProviderStore((state) => state.baseURL);
  const kind: TransportKind = selectTransport(
    models.find((m) => m.id === modelId),
    baseURL
  );
  return `${kind}:${modelId ?? ""}`;
}

interface UseConversation {
  /** The transcript, including a placeholder row while awaiting first tokens. */
  messages: ChatMessage[];
  /** Id of the message currently streaming, if any. */
  streamingId?: string;
  isStreaming: boolean;
  send: (text: string, file?: MessageFile) => void;
  stop: () => void;
  regenerate: () => void;
}

/**
 * Reactive view of a conversation. The AI SDK's Chat instance, UIMessage, and
 * the message conversion all stay behind this — views deal in ChatMessage and
 * four verbs.
 */
export function useConversation(chatId: string): UseConversation {
  // An instance picks its transport once and keeps it, so when the transport's
  // inputs change, rebindConversation evicts and this is what re-subscribes to
  // the replacement. Without it useChat stays bound to the evicted instance
  // while sends stream into a new one, and the transcript appears to freeze.
  const transport = useTransportIdentity(chatId);
  const instance = useMemo(() => conversationOf(chatId), [chatId, transport]);
  const {
    messages: uiMessages,
    status,
    stop,
    regenerate,
  } = useChat({ chat: instance });

  const isStreaming = status === "streaming" || status === "submitted";

  // Converted once per token and reused by both the persist effect and the
  // render — this is the hot path, so don't do the work twice.
  const transcript = useMemo(
    () => transcriptOf(chatId, uiMessages),
    [chatId, uiMessages]
  );

  useEffect(() => {
    if (transcript.length === 0) return;
    syncTranscript(chatId, transcript);
  }, [chatId, transcript]);

  const messages = useMemo(() => {
    // Placeholder row so the view can show "Thinking…" before tokens arrive.
    if (status !== "submitted") return transcript;
    return [
      ...transcript,
      { id: "pending", role: "assistant" as const, content: "" },
    ];
  }, [transcript, status]);

  const send = useCallback(
    (text: string, file?: MessageFile) => sendToConversation(chatId, text, file),
    [chatId]
  );
  const handleStop = useCallback(() => void stop(), [stop]);
  const handleRegenerate = useCallback(() => void regenerate(), [regenerate]);

  return {
    messages,
    streamingId: isStreaming ? messages.at(-1)?.id : undefined,
    isStreaming,
    send,
    stop: handleStop,
    regenerate: handleRegenerate,
  };
}
