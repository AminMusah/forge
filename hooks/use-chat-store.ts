import { create } from "zustand";

import type { Chat, ChatMessage } from "@/lib/types";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function titleFrom(content: string) {
  const collapsed = content.trim().replace(/\s+/g, " ");
  return collapsed.length > 40 ? `${collapsed.slice(0, 40).trimEnd()}…` : collapsed;
}

interface ChatStore {
  chats: Chat[];
  /** Creates a chat from the first user message, pinned to a model; returns its id. */
  createChat: (content: string, modelId: string) => string;
  /** Appends a user message and bumps the chat to the top of recents. */
  sendMessage: (chatId: string, content: string) => boolean;
  /** Adds an empty assistant message to stream into; returns its id. */
  addAssistantMessage: (chatId: string) => string | null;
  /** Appends a chunk of text to a streaming assistant message. */
  appendToMessage: (chatId: string, messageId: string, chunk: string) => boolean;
  /** Replaces a chat's transcript wholesale (AI SDK sync after a reply finishes). */
  syncMessages: (chatId: string, messages: ChatMessage[]) => boolean;
  /** Re-pins a chat to another model; no recency bump (metadata, not activity). */
  rebindModel: (chatId: string, modelId: string) => boolean;
  renameChat: (id: string, title: string) => boolean;
  deleteChat: (id: string) => boolean;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  createChat: (content, modelId) => {
    const id = crypto.randomUUID();
    const chat: Chat = {
      id,
      title: titleFrom(content),
      updatedAt: today(),
      modelId,
      messages: [{ id: crypto.randomUUID(), role: "user", content: content.trim() }],
    };
    set((state) => ({ chats: [chat, ...state.chats] }));
    return id;
  },
  sendMessage: (chatId, content) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (!chat) return false;
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
    };
    set((state) => {
      const updated = state.chats.map((c) =>
        c.id === chatId
          ? { ...c, updatedAt: today(), messages: [...c.messages, message] }
          : c
      );
      const target = updated.find((c) => c.id === chatId)!;
      return { chats: [target, ...updated.filter((c) => c.id !== chatId)] };
    });
    return true;
  },
  addAssistantMessage: (chatId) => {
    if (!get().chats.some((c) => c.id === chatId)) return null;
    const messageId = crypto.randomUUID();
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: [...c.messages, { id: messageId, role: "assistant" as const, content: "" }],
            }
          : c
      ),
    }));
    return messageId;
  },
  appendToMessage: (chatId, messageId, chunk) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (!chat || !chat.messages.some((m) => m.id === messageId)) return false;
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, content: m.content + chunk } : m
              ),
            }
          : c
      ),
    }));
    return true;
  },
  syncMessages: (chatId, messages) => {
    if (!get().chats.some((c) => c.id === chatId)) return false;
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, updatedAt: today(), messages } : c
      ),
    }));
    return true;
  },
  rebindModel: (chatId, modelId) => {
    if (!get().chats.some((chat) => chat.id === chatId)) return false;
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId ? { ...chat, modelId } : chat
      ),
    }));
    return true;
  },
  renameChat: (id, title) => {
    if (!get().chats.some((chat) => chat.id === id)) return false;
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === id ? { ...chat, title } : chat
      ),
    }));
    return true;
  },
  deleteChat: (id) => {
    if (!get().chats.some((chat) => chat.id === id)) return false;
    set((state) => ({
      chats: state.chats.filter((chat) => chat.id !== id),
    }));
    return true;
  },
}));
