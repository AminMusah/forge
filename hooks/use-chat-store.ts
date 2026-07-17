import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PersistStorage, StorageValue } from "zustand/middleware";

import type { Chat, ChatMessage, MessageFile } from "@/lib/types";

/**
 * Transcripts are synced into the store on every streamed token — cheap in
 * memory, but serialising every chat to localStorage that often is not.
 *
 * This is a PersistStorage rather than a plain Storage on purpose: zustand's
 * createJSONStorage stringifies BEFORE it reaches the inner Storage, so
 * debouncing there still pays the full JSON.stringify of every chat per token.
 * Holding the object and stringifying inside flush() is what actually batches
 * the work.
 *
 * A trailing-only debounce would never fire mid-stream (tokens arrive faster
 * than `wait` resets it), so `maxWait` guarantees progress, and a pagehide
 * flush is what makes a reload mid-reply keep what arrived.
 */
function debouncedChatStorage(
  wait: number,
  maxWait: number
): PersistStorage<{ chats: Chat[] }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: [string, StorageValue<{ chats: Chat[] }>] | undefined;
  let firstPendingAt: number | undefined;

  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (!pending) return;
    const [name, value] = pending;
    pending = undefined;
    firstPendingAt = undefined;
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // Quota exceeded — keep the session usable rather than throwing; the
      // in-memory store is still correct, only the write is lost.
    }
  };

  // The store is only ever persisted client-side; guard so a server render or
  // a non-browser environment can't touch window.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (name) => {
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<{ chats: Chat[] }>;
      } catch {
        // Corrupt payload — start clean rather than wedging hydration.
        return null;
      }
    },
    setItem: (name, value) => {
      pending = [name, value];
      firstPendingAt ??= Date.now();
      // Past the ceiling, write now: a stream would otherwise reset the timer
      // forever and nothing would ever land.
      if (Date.now() - firstPendingAt >= maxWait) {
        flush();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(flush, wait);
    },
    removeItem: (name) => {
      pending = undefined;
      firstPendingAt = undefined;
      clearTimeout(timer);
      timer = undefined;
      localStorage.removeItem(name);
    },
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function titleFrom(content: string) {
  const collapsed = content.trim().replace(/\s+/g, " ");
  return collapsed.length > 40
    ? `${collapsed.slice(0, 40).trimEnd()}…`
    : collapsed;
}

interface ChatStore {
  chats: Chat[];
  /**
   * False until localStorage has been read. Views gate on this: chatInstance()
   * seeds an AI SDK Chat from the store, so rendering before rehydration would
   * seed it from an empty store and silently lose the transcript.
   */
  hasHydrated: boolean;
  setHasHydrated: () => void;
  /**
   * Creates a chat from the first user message, pinned to a model; returns its
   * id. `content` is always what the user typed — an attached `file` rides
   * alongside it rather than replacing it, so the title reads the same either way.
   */
  createChat: (content: string, modelId: string, file?: MessageFile) => string;
  /** Appends a user message and bumps the chat to the top of recents. */
  sendMessage: (
    chatId: string,
    content: string,
    file?: MessageFile
  ) => boolean;
  /** Replaces a chat's transcript (synced from the AI SDK as tokens arrive). */
  syncMessages: (chatId: string, messages: ChatMessage[]) => boolean;
  /** Re-pins a chat to another model; no recency bump (metadata, not activity). */
  rebindModel: (chatId: string, modelId: string) => boolean;
  renameChat: (id: string, title: string) => boolean;
  deleteChat: (id: string) => boolean;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      chats: [],
      hasHydrated: false,
      setHasHydrated: () => set({ hasHydrated: true }),

      createChat: (content, modelId, file) => {
        const id = crypto.randomUUID();
        const chat: Chat = {
          id,
          title: titleFrom(content),
          updatedAt: today(),
          modelId,
          messages: [
            {
              id: crypto.randomUUID(),
              role: "user",
              content: content.trim(),
              ...(file ? { file } : {}),
            },
          ],
        };
        set((state) => ({ chats: [chat, ...state.chats] }));
        return id;
      },

      sendMessage: (chatId, content, file) => {
        const chat = get().chats.find((c) => c.id === chatId);
        if (!chat) return false;
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: content.trim(),
          ...(file ? { file } : {}),
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
    }),
    {
      name: "forge-chats",
      version: 1,
      storage: debouncedChatStorage(500, 2000),
      // Hydration is triggered explicitly on mount so the server's empty render
      // and the client's stored chats can't disagree.
      skipHydration: true,
      // Chats persist whole, attachments included: an attachment is only ever the
      // text we extracted, and extraction is capped (MAX_ATTACHMENT_CHARS) well
      // under what would threaten the ~5MB quota. Keeping it is what makes a
      // reloaded chat coherent — the file's text IS the question the assistant
      // answered.
      partialize: (state) => ({ chats: state.chats }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(),
    }
  )
);
