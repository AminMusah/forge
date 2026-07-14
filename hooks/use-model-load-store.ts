import { create } from "zustand";

interface ModelLoadStore {
  /** Human-readable status while a browser model downloads/compiles, if any. */
  status: string | null;
  setStatus: (status: string | null) => void;
}

/**
 * Load progress is transient UI state, not conversation content. Streaming it
 * as message text would append hundreds of lines to the transcript (the
 * progress callback fires per file, per chunk), re-running persistence and
 * markdown parsing on every one — which is exactly how the first attempt ran
 * the tab out of memory.
 */
export const useModelLoadStore = create<ModelLoadStore>((set) => ({
  status: null,
  setStatus: (status) => set({ status }),
}));
