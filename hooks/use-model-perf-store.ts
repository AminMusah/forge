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
  /** Generation rate. 0 for pipeline tasks, which emit no tokens. */
  tokensPerSecond: number;
  /** Wall time of the last pipeline run. 0 for streamed generation. */
  inferenceMs: number;
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
          // Zero means "not applicable to this run", never "it was instant" — so
          // a reported 0 keeps whatever was last measured rather than erasing it.
          // That's what keeps the cold-load time on screen once a model is warm.
          loadMs: next.loadMs > 0 ? next.loadMs : state.stats[modelId]?.loadMs ?? 0,
          tokensPerSecond:
            next.tokensPerSecond > 0
              ? next.tokensPerSecond
              : state.stats[modelId]?.tokensPerSecond ?? 0,
          inferenceMs:
            next.inferenceMs > 0
              ? next.inferenceMs
              : state.stats[modelId]?.inferenceMs ?? 0,
        },
      },
    })),
}));
