"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";

import {
  conversationOf,
  sendToConversation,
  syncTranscript,
  toChatMessages,
} from "@/lib/conversation";
import type { ChatMessage } from "@/lib/types";

interface UseConversation {
  /** The transcript, including a placeholder row while awaiting first tokens. */
  messages: ChatMessage[];
  /** Id of the message currently streaming, if any. */
  streamingId?: string;
  isStreaming: boolean;
  send: (text: string) => void;
  stop: () => void;
  regenerate: () => void;
}

/**
 * Reactive view of a conversation. The AI SDK's Chat instance, UIMessage, and
 * the message conversion all stay behind this — views deal in ChatMessage and
 * four verbs.
 */
export function useConversation(chatId: string): UseConversation {
  const instance = useMemo(() => conversationOf(chatId), [chatId]);
  const {
    messages: uiMessages,
    status,
    stop,
    regenerate,
  } = useChat({ chat: instance });

  const isStreaming = status === "streaming" || status === "submitted";

  // Converted once per token and reused by both the persist effect and the
  // render — this is the hot path, so don't do the work twice.
  const transcript = useMemo(() => toChatMessages(uiMessages), [uiMessages]);

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
    (text: string) => sendToConversation(chatId, text),
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
