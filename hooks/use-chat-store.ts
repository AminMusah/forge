import { create } from "zustand";

import { seedChats, type Chat } from "@/lib/mock-data";

interface ChatStore {
  chats: Chat[];
  renameChat: (id: string, title: string) => boolean;
  deleteChat: (id: string) => boolean;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: seedChats,
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
