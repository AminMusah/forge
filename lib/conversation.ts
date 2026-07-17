import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";

import { useChatProviderStore } from "@/hooks/use-chat-provider-store";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModal } from "@/hooks/use-modal-store";
import {
  chatModels,
  resolveChatModel,
  useModelStore,
} from "@/hooks/use-model-store";
import { useTokenStore } from "@/hooks/use-token-store";
import { composeWithFile } from "@/lib/attachments";
import { BrowserTransport } from "@/lib/browser-transport";
import { LocalChatTransport } from "@/lib/local-chat-transport";
import { splitLeakedReasoning } from "@/lib/reasoning";
import { transportFor } from "@/lib/transport-kind";
import type { ChatMessage, MessageFile } from "@/lib/types";

/**
 * A conversation is one chat's turn lifecycle: sending, streaming, stopping,
 * regenerating — and every store write those cause. It owns the AI SDK Chat
 * instance (kept outside React so streams survive navigation), the transcript
 * sync, the reasoning-learning rule, and the retry-once-a-token-arrives queue.
 *
 * Callers never see UIMessage, the Chat instance, or the message conversion.
 * The chat store keeps what a turn doesn't cause: titles, recency, rename,
 * delete. Model rebinding is NOT in that list, though it looks like it should
 * be: an instance picks its transport once, so re-pinning a chat to a model on
 * another backend has to rebuild the conversation — see rebindConversation.
 */
const conversations = new Map<
  string,
  { instance: Chat<UIMessage>; identity: string }
>();

/**
 * Instances superseded by a rebuild, waiting to be stopped AFTER commit.
 *
 * conversationOf runs inside a useMemo, and React may discard a render it never
 * commits (StrictMode's double invocation, a concurrent render, a thrown
 * Suspense). stop() aborts a live stream and can't be undone, so doing it during
 * render risks killing a reply for a render that never happened. Building an
 * instance is safe to repeat — it reseeds from the store — but stopping one is
 * not, so only the stop is deferred.
 */
const supersededInstances = new Set<Chat<UIMessage>>();

/**
 * Stop everything a rebuild replaced. Called from an effect once the render that
 * caused the rebuild has actually committed.
 */
export function flushSupersededConversations() {
  for (const instance of supersededInstances) void instance.stop();
  supersededInstances.clear();
}

/** Turns that failed for want of a token, resent once one is added. */
const awaitingToken = new Set<string>();

/**
 * Store → model. An attachment is inlined into the text part rather than emitted
 * as a file part: every chat model here is text-generation, and a file part would
 * reach three transports that would each have to decide what to do with a
 * text/plain data URL. Inlining means none of them ever sees a file.
 *
 * The composed text is therefore what the MODEL reads, never what the view
 * renders — see syncTranscript for why that stays true.
 */
function toUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [
      ...(m.reasoning
        ? [{ type: "reasoning" as const, text: m.reasoning }]
        : []),
      ...(m.content
        ? [
            {
              type: "text" as const,
              text: m.file ? composeWithFile(m.content, m.file) : m.content,
            },
          ]
        : []),
    ],
  }));
}

/** Flattens UI messages (parts) into the store's plain-text shape. */
function toChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const text = m.parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
      const reasoning = m.parts
        .map((part) => (part.type === "reasoning" ? part.text : ""))
        .join("");

      // A user message's text here may be the file-composed form (toUIMessages),
      // so it is NOT authoritative — syncTranscript keeps the stored original.
      if (m.role !== "assistant") {
        return {
          id: m.id,
          role: m.role as ChatMessage["role"],
          content: text,
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
  const modelIdOf = () =>
    useChatStore.getState().chats.find((c) => c.id === chatId)?.modelId;

  // A BYO-chat model is synthetic (derived from the chat connection), so it
  // won't be in the persisted store — chatModels adds it, resolveChatModel
  // matches it even when the connection has since been re-pointed.
  const modelOf = () => resolveChatModel(chatModels(), modelIdOf());

  // conversationOf serves CHAT (text-generation) — every other task runs in a
  // generated PlaygroundView, which reaches the model through the forge bridge,
  // not here. So the transport is one of four peers: a browser model runs on the
  // user's GPU; a localhost provider is called straight from the browser; a BYO
  // model goes to /api/chat-byo (their own OpenAI-compatible provider);
  // everything else goes to /api/chat (the HF router). Downstream is identical.
  const model = modelOf();
  // Chosen once, for the life of this instance. onFinish and onError close over
  // the kind rather than re-deriving it from the model flags.
  const { kind, identity } = transportFor(
    model,
    useChatProviderStore.getState().baseURL,
    modelIdOf()
  );

  // An instance is reusable only while the inputs it was built from still hold.
  // Rebinds evict eagerly, but not every change is a rebind: the chat provider is
  // fetched AFTER mount (its key is httpOnly, so only the server knows it's set),
  // so a BYO chat's first conversationOf can land before the connection is known,
  // resolve to the router, and cache that. Comparing identities rebuilds it once
  // the connection arrives instead of answering with the stale transport forever.
  const existing = conversations.get(chatId);
  if (existing?.identity === identity) return existing.instance;
  // Queue the stop rather than doing it here: this runs inside a useMemo, and a
  // render React discards would otherwise abort a live stream. The map entry is
  // replaced by the set() below; useConversation flushes the stop after commit.
  if (existing) supersededInstances.add(existing.instance);

  const stored = useChatStore.getState().chats.find((c) => c.id === chatId);
  const transport =
    // `model &&` narrows for the compiler; selectTransport only answers
    // "browser" for a model it was given.
    model && kind === "browser"
      ? new BrowserTransport(model.id, model.dtype)
      : kind === "local"
        ? new LocalChatTransport(model?.reasoning === true)
        : kind === "byo"
          ? new DefaultChatTransport<UIMessage>({
              api: "/api/chat-byo",
              prepareSendMessagesRequest: ({ messages, body }) => ({
                body: { ...body, messages, reasoning: modelOf()?.reasoning },
              }),
            })
          : new DefaultChatTransport<UIMessage>({
              api: "/api/chat",
              // Resolve the model at request time so a rebind WITHIN the router
              // — to another HF model — lands without rebuilding the instance.
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
      // An instance evicted mid-stream (a rebind) still finishes its aborted
      // stream. Its transcript is stale the moment it was replaced, and its
      // empty tail is the abort rather than a router failure — so it must
      // neither write nor toast.
      if (conversations.get(chatId)?.instance !== instance) return;

      const messages = transcriptOf(chatId, instance.messages);
      const last = messages.at(-1);

      // Reasoning that leaked into the text means the server didn't know this
      // model reasons — flag it so the next turn extracts it properly.
      const modelId = modelIdOf();
      if (modelId && last?.role === "assistant" && last.reasoning) {
        useModelStore.getState().markReasoning(modelId);
      }

      // Router failures that end the stream WITHOUT an error event leave no
      // assistant text behind — an empty reply is the only symptom, and only the
      // HF router does this. Browser and BYO transports surface real errors via
      // onError, so gating here avoids a confusing second toast on those paths.
      if (
        kind === "hf-router" &&
        (last?.role !== "assistant" || !last.content)
      ) {
        toast.error("The model returned no response", {
          description: "Try sending again, or pick a different model.",
        });
      }

      syncTranscript(chatId, messages);
    },
    onError: (error) => {
      // Only the HF router needs a token. A browser model runs on the GPU, and
      // a local or BYO model uses the user's own provider — none of their
      // failures is a missing token, so don't prompt for one; just surface what
      // went wrong.
      if (kind !== "hf-router") {
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
            useModal.getState().onOpen("providers");
          }
        });
    },
  });

  conversations.set(chatId, { instance, identity });
  return instance;
}

/**
 * The transcript as the view and the store should both see it: assistant turns
 * from the SDK, user turns from the STORE.
 *
 * A user turn's SDK copy is the form built for the MODEL — the file's text
 * inlined by toUIMessages, the MessageFile itself gone. Rendering that would
 * show the user their own prompt payload instead of what they typed, and
 * persisting it would make that permanent. The store is where user turns are
 * authored (sendToConversation writes one before submitting), so it wins.
 * Matching by id keeps regenerate's truncation working: a turn the SDK has
 * dropped is simply not in the list to restore.
 */
export function transcriptOf(
  chatId: string,
  messages: UIMessage[]
): ChatMessage[] {
  const stored = useChatStore.getState().chats.find((c) => c.id === chatId);
  const authored = new Map(
    stored?.messages.filter((m) => m.role === "user").map((m) => [m.id, m])
  );
  return toChatMessages(messages).map((m) =>
    m.role === "user" ? (authored.get(m.id) ?? m) : m
  );
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
export function startConversation(
  text: string,
  modelId: string,
  file?: MessageFile
): string {
  const chatId = useChatStore.getState().createChat(text, modelId, file);
  // The instance seeds from the store, which now holds the user message; a
  // no-arg send submits exactly that — composed with the file by toUIMessages.
  void conversationOf(chatId).sendMessage();
  return chatId;
}

/** Sends a message in an existing conversation. */
export function sendToConversation(
  chatId: string,
  text: string,
  file?: MessageFile
) {
  // Recorded in the store for recency and search; the instance owns the stream.
  useChatStore.getState().sendMessage(chatId, text, file);
  // The store keeps what was typed; the model gets the file inlined ahead of it.
  void conversationOf(chatId).sendMessage({
    text: file ? composeWithFile(text.trim(), file) : text,
  });
}

/**
 * Drops a reply that was still streaming when its conversation was replaced.
 * The transcript syncs every token, so an aborted stream leaves a half-written
 * assistant turn behind — one that answers a question the user has just re-aimed
 * at a different model, with nothing to mark it as cut off.
 */
function dropPartialReply(chatId: string) {
  const messages =
    useChatStore.getState().chats.find((c) => c.id === chatId)?.messages ?? [];
  if (messages.at(-1)?.role !== "assistant") return;
  syncTranscript(chatId, messages.slice(0, -1));
}

/**
 * Re-pins a chat to another model and rebuilds its conversation — one verb, so
 * callers don't have to know that an instance picks its transport once and keeps
 * it. Without the rebuild a rebind across backends keeps talking to the old one:
 * the router transport would post the new model's id to /api/chat, and a
 * BrowserTransport would go on running the model id it froze at construction.
 */
export function rebindConversation(chatId: string, modelId: string) {
  const status = conversations.get(chatId)?.instance.status;
  const streaming = status === "streaming" || status === "submitted";
  if (!useChatStore.getState().rebindModel(chatId, modelId)) return;
  // Evicting stops the stream; useConversation rebuilds on the kind change.
  evictConversation(chatId);
  if (streaming) dropPartialReply(chatId);
}

/**
 * Re-sends every turn that failed because no token was set. The user message
 * is still on the instance, so a no-arg send resubmits it.
 */
export function retryPendingConversations() {
  for (const chatId of awaitingToken) {
    void conversations.get(chatId)?.instance.sendMessage();
  }
  awaitingToken.clear();
}

/**
 * Stops any in-flight stream and forgets the conversation — because the chat was
 * deleted, or because it must be rebuilt on another transport. The next
 * conversationOf reseeds from the store, so the transcript survives either way.
 */
export function evictConversation(chatId: string) {
  const existing = conversations.get(chatId);
  if (!existing) return;
  void existing.instance.stop();
  conversations.delete(chatId);
}
