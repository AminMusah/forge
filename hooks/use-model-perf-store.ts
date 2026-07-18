import { create } from "zustand";

/**
 * Live performance signals for browser (WebGPU) models, keyed by model id — how
 * long the cold load took and how fast it generates. Not persisted: these are
 * measured on this device this session, so a stored number would just be a stale
 * guess about different hardware. Written by the browser chat transport, read by
 * the model chip.
 */
export interface ModelStats {
  /** Cold-load/compile time in ms (0 when the model was already warm). */
  loadMs: number;
  tokensPerSecond: number;
}

interface ModelPerfStore {
  stats: Record<string, ModelStats>;
  setStats: (modelId: string, stats: ModelStats) => void;
}

export const useModelPerfStore = create<ModelPerfStore>((set) => ({
  stats: {},
  setStats: (modelId, next) =>
    set((state) => ({
      stats: {
        ...state.stats,
        [modelId]: {
          tokensPerSecond: next.tokensPerSecond,
          // Keep the cold-load time visible once measured: warm replies report
          // ~0, and blanking it every time would hide a number worth seeing.
          loadMs: next.loadMs > 0 ? next.loadMs : state.stats[modelId]?.loadMs ?? 0,
        },
      },
    })),
}));
