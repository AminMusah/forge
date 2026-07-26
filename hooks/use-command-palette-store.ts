import { create } from "zustand";

/**
 * Open/close state for the command palette. Dedicated rather than folded into
 * use-modal-store: that store carries chat/model payloads and is single-active by
 * design, while the palette is a standalone overlay opened by ⌘K from anywhere.
 */
interface CommandPaletteStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
