import { create } from "zustand";

import type { Chat, Model } from "@/lib/types";

export type ModalType =
  | "searchChats"
  | "renameChat"
  | "deleteChat"
  | "providers"
  | "removeModel";

export interface ModalData {
  chat?: Chat;
  model?: Model;
  /** Size of the weights about to be freed, for the removeModel dialog. */
  size?: string;
  /** Runs on confirm; the opener owns what removal actually means. */
  onConfirm?: () => void | Promise<void>;
}

interface ModalStore {
  type: ModalType | null;
  data: ModalData;
  isOpen: boolean;
  onOpen: (type: ModalType, data?: ModalData) => void;
  onClose: () => void;
}

export const useModal = create<ModalStore>((set) => ({
  type: null,
  data: {},
  isOpen: false,
  onOpen: (type, data = {}) => set({ isOpen: true, type, data }),
  onClose: () => set({ type: null, isOpen: false }),
}));
