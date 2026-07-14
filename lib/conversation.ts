import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";

import { useChatStore } from "@/hooks/use-chat-store";
import { useModal } from "@/hooks/use-modal-store";
import { useModelStore } from "@/hooks/use-model-store";
import { useTokenStore } from "@/hooks/use-token-store";
import { forgetWaveform, lastAudio, readAsDataUrl } from "@/lib/audio";
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
      // A clip read back from storage has no url — the bytes are stripped when
      // the store is persisted. The transcript is what was worth keeping; the
      // part is still emitted so the view can name the file that produced it.
      ...(m.file
        ? [
            {
              type: "file" as const,
              mediaType: m.file.mediaType,
              filename: m.file.name,
              url: m.file.url ?? "",
            },
          ]
        : []),
      // A file-only message has no text; an empty text part is not the same as
      // no text part to convertToModelMessages.
      ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
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
        // The url rides along in memory; the store strips it before persisting.
        const filePart = m.parts.find((part) => part.type === "file");
        const file = filePart
          ? {
              name: filePart.filename ?? "audio",
              mediaType: filePart.mediaType,
              url: filePart.url || undefined,
            }
          : undefined;
        return {
          id: m.id,
          role: m.role as ChatMessage["role"],
          content: text,
          ...(file ? { file } : {}),
        };
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

  // The transport is chosen by (runtime × task) — and it is the ONLY thing that
  // changes. Everything downstream (persistence, stop, the message list) is
  // identical whether this is a chat reply from a server model or a transcript
  // computed on the user's own GPU.
  const model = modelOf();
  const task = model?.task ?? "text-generation";
  const transport =
    model?.runtime === "browser"
      ? new BrowserTransport(model.id, model.dtype, task)
      : task === "automatic-speech-recognition"
        ? new DefaultChatTransport<UIMessage>({
            api: "/api/transcribe",
            // Send the clip, not the transcript history: ASR takes one audio
            // file, and re-uploading every previous clip as base64 would be
            // megabytes of waste per request.
            prepareSendMessagesRequest: ({ messages, body }) => {
              const current = modelOf();
              return {
                body: {
                  ...body,
                  audio: lastAudio(messages)?.url ?? "",
                  modelId: modelIdOf(),
                  provider: current?.provider,
                },
              };
            },
          })
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

/**
 * Creates a transcription from a dropped audio file and runs it. Structurally
 * this IS a chat — the user "message" is the clip, the assistant "message" is
 * the transcript — so recents, search, rename, delete and the task-grouped
 * sidebar all work with no knowledge that this turn wasn't typed.
 */
export async function startTranscription(
  file: File,
  modelId: string
): Promise<string> {
  const chatId = useChatStore.getState().createChat(file.name, modelId, {
    name: file.name,
    mediaType: file.type || "audio/mpeg",
    // Carried in memory and stripped on persist — the instance seeds from the
    // store, so this is how the clip reaches the transport.
    url: await readAsDataUrl(file),
  });

  // The store now holds the message; a no-arg send submits exactly that.
  void conversationOf(chatId).sendMessage();
  return chatId;
}

/**
 * Adds another clip to an existing transcription thread. The composer means what
 * it means everywhere else in Forge — what you drop becomes the next message.
 *
 * Note the id is the SDK's to mint, not ours: `sendMessage({ messageId })` means
 * "EDIT the existing user message with this id" (it throws if there isn't one),
 * so an id passed here would be an edit of a message that doesn't exist. The
 * clip rides on the file part instead, which needs no id at all.
 */
export async function sendAudioToConversation(chatId: string, file: File) {
  const url = await readAsDataUrl(file);
  const mediaType = file.type || "audio/mpeg";

  // Recorded in the store for recency and search; the instance owns the turn,
  // and its transcript sync replaces this message with the SDK's own.
  useChatStore
    .getState()
    .sendMessage(chatId, file.name, { name: file.name, mediaType, url });

  void conversationOf(chatId).sendMessage({
    files: [{ type: "file", mediaType, filename: file.name, url }],
  });
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
  // The clips go with the chat's messages; only their cached waveforms are held
  // outside it, so release those.
  const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
  for (const message of chat?.messages ?? []) forgetWaveform(message.id);

  const instance = conversations.get(chatId);
  if (!instance) return;
  void instance.stop();
  conversations.delete(chatId);
}
