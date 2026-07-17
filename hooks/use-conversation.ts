"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";

import { useChatProviderStore } from "@/hooks/use-chat-provider-store";
import { useChatStore } from "@/hooks/use-chat-store";
import { resolveChatModel, useChatModels } from "@/hooks/use-model-store";
import {
  conversationOf,
  flushSupersededConversations,
  sendToConversation,
  syncTranscript,
  transcriptOf,
} from "@/lib/conversation";
import { transportFor } from "@/lib/transport-kind";
import type { ChatMessage, MessageFile } from "@/lib/types";

/**
 * What this chat's transport is built from, tracked reactively. Reads the
 * catalog through useChatModels so the synthetic BYO model — which is derived
 * from the chat connection rather than stored — resolves like any other.
 */
function useTransportIdentity(chatId: string): string {
  const modelId = useChatStore((state) =>
    state.chats.find((c) => c.id === chatId)?.modelId
  );
  const models = useChatModels();
  const baseURL = useChatProviderStore((state) => state.baseURL);
  return transportFor(resolveChatModel(models, modelId), baseURL, modelId)
    .identity;
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
  // An instance picks its transport once and keeps it, so when the inputs change
  // conversationOf builds a replacement — and this is what re-subscribes to it.
  // Without it useChat stays bound to the superseded instance while sends stream
  // into the new one, and the transcript appears to freeze.
  const transport = useTransportIdentity(chatId);
  const instance = useMemo(() => conversationOf(chatId), [chatId, transport]);

  // Stop whatever this rebuild superseded — after commit, not during the memo.
  // Keyed on the instance so it runs exactly when a rebuild actually landed.
  useEffect(() => {
    flushSupersededConversations();
  }, [instance]);

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
  // Aborting is what stop() DOES, so its AbortError rejection is the success
  // path, not a failure — `void` alone would surface it as an unhandled
  // rejection in the console. Real failures reach the instance's onError.
  const handleStop = useCallback(() => {
    stop().catch(() => {});
  }, [stop]);
  const handleRegenerate = useCallback(() => {
    regenerate().catch(() => {});
  }, [regenerate]);

  return {
    messages,
    streamingId: isStreaming ? messages.at(-1)?.id : undefined,
    isStreaming,
    send,
    stop: handleStop,
    regenerate: handleRegenerate,
  };
}
