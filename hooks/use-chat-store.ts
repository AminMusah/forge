import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Chat, ChatMessage, MessageFile } from "@/lib/types";

/**
 * Transcripts are synced into the store on every streamed token — cheap in
 * memory, but serialising every chat to localStorage that often is not. Batch
 * the writes; the last one always lands.
 */
function debouncedLocalStorage(wait: number): Storage {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: [string, string] | undefined;

  const flush = () => {
    if (!pending) return;
    const [key, value] = pending;
    pending = undefined;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Quota exceeded — keep the session usable rather than throwing; the
      // in-memory store is still correct, only the write is lost.
    }
  };

  return {
    getItem: (key) => localStorage.getItem(key),
    removeItem: (key) => {
      pending = undefined;
      localStorage.removeItem(key);
    },
    setItem: (key, value) => {
      pending = [key, value];
      clearTimeout(timer);
      timer = setTimeout(flush, wait);
    },
  } as Storage;
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
   * id. `file` marks a submitted clip: the message carries its name, never its
   * bytes (see MessageFile).
   */
  createChat: (content: string, modelId: string, file?: MessageFile) => string;
  /** Appends a user message and bumps the chat to the top of recents. */
  sendMessage: (chatId: string, content: string, file?: MessageFile) => boolean;
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
          // A submitted clip titles the chat with its filename, so recents and
          // search read the same either way.
          title: titleFrom(content),
          updatedAt: today(),
          modelId,
          messages: [
            {
              id: crypto.randomUUID(),
              role: "user",
              // The file IS the message; repeating its name as text would just
              // duplicate the chip the view already renders.
              content: file ? "" : content.trim(),
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
          content: file ? "" : content.trim(),
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
      storage: createJSONStorage(() => debouncedLocalStorage(500)),
      // Hydration is triggered explicitly on mount so the server's empty render
      // and the client's stored chats can't disagree.
      skipHydration: true,
      // Persist everything EXCEPT the audio bytes. A clip rides on the message
      // as a data URL so the player and a retry can reach it, but writing it
      // here would put megabytes of base64 into a ~5MB quota and silently drop
      // the write for every chat. Stripped at the boundary, so the in-memory
      // store stays whole and only the stored copy forgets the audio.
      partialize: (state) => ({
        chats: state.chats.map((chat) => ({
          ...chat,
          messages: chat.messages.map(({ file, ...message }) =>
            file
              ? { ...message, file: { name: file.name, mediaType: file.mediaType } }
              : message
          ),
        })),
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(),
    }
  )
);
