import { create } from "zustand";

import { models, type Model } from "@/lib/mock-data";

interface ModelStore {
  selectedModel: Model;
  setModel: (model: Model) => void;
}

export const useModelStore = create<ModelStore>((set) => ({
  selectedModel: models[0],
  setModel: (model) => set({ selectedModel: model }),
}));
