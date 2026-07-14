import { create } from "zustand";

import type { HfTask } from "@/lib/hf-tasks";
import { defaultModels } from "@/lib/models";
import type { Model } from "@/lib/types";

interface ModelStore {
  /** Curated defaults plus models added from Hugging Face search. */
  models: Model[];
  selectedModel: Model;
  setModel: (model: Model) => void;
  /** Adds a model discovered via search; refreshes the entry if present. */
  addModel: (model: Model) => void;
  /** Records that a model emits chain-of-thought (learned from its output). */
  markReasoning: (modelId: string) => void;
}

export const useModelStore = create<ModelStore>((set) => ({
  models: defaultModels,
  selectedModel: defaultModels[0],
  setModel: (model) => set({ selectedModel: model }),
  addModel: (model) =>
    set((state) => ({
      models: state.models.some((m) => m.id === model.id)
        ? // Upsert: search results carry fresher fields (e.g. the pinned
          // provider) than an entry added earlier.
          state.models.map((m) => (m.id === model.id ? model : m))
        : [...state.models, model],
    })),
  markReasoning: (modelId) =>
    set((state) => {
      const model = state.models.find((m) => m.id === modelId);
      if (!model || model.reasoning) return state;
      const updated = { ...model, reasoning: true };
      return {
        models: state.models.map((m) => (m.id === modelId ? updated : m)),
        selectedModel:
          state.selectedModel.id === modelId ? updated : state.selectedModel,
      };
    }),
}));

/** Task classification of a chat's pinned model. */
export function taskForModel(modelId: string): HfTask {
  return (
    useModelStore.getState().models.find((m) => m.id === modelId)?.task ??
    "text-generation"
  );
}
