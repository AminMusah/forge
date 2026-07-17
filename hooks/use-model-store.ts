import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useChatProviderStore } from "@/hooks/use-chat-provider-store";
import type { HfTask } from "@/lib/hf-tasks";
import { defaultChatModel, defaultModels } from "@/lib/models";
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

/**
 * Stored models win (they carry learned reasoning flags and provider pins),
 * but the curated defaults are always union'd back in — otherwise a catalog
 * persisted today would never pick up models added to defaultModels later.
 */
function mergeModels(stored: Model[]): Model[] {
  const missing = defaultModels.filter(
    (d) => !stored.some((s) => s.id === d.id)
  );
  return [...stored, ...missing];
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      models: defaultModels,
      selectedModel: defaultChatModel,
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
    }),
    {
      name: "forge-models",
      version: 1,
      skipHydration: true,
      partialize: (state) => ({
        models: state.models,
        selectedModel: state.selectedModel,
      }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<ModelStore> | undefined;
        const models = mergeModels(stored?.models ?? []);
        // A selected model that no longer exists (or was never stored) falls
        // back to the local default rather than leaving the chip blank.
        const selected =
          models.find((m) => m.id === stored?.selectedModel?.id) ??
          defaultChatModel;
        return { ...current, models, selectedModel: selected };
      },
    }
  )
);

/** Marks an id as belonging to the BYO connection rather than the catalog. */
export const BYO_CHAT_PREFIX = "byo-chat:";

/**
 * The model a chat's pinned id refers to.
 *
 * A BYO id resolves to the CURRENT connection whatever model it names. There is
 * only ever one BYO model, so re-pointing the connection at another model — Groq
 * to a local Ollama, say — must not orphan the chats already using it. Both BYO
 * transports already read the model from the connection at send time (the cookie
 * for /api/chat-byo, the store for LocalChatTransport), so the suffix on a
 * pinned id is a label, not an identity.
 *
 * Without this an orphaned chat resolves to no model at all and falls back to
 * the HF router — demanding a token from someone who never chose it.
 */
export function resolveChatModel(
  models: Model[],
  modelId: string | undefined
): Model | undefined {
  const exact = models.find((m) => m.id === modelId);
  if (exact) return exact;
  return modelId?.startsWith(BYO_CHAT_PREFIX)
    ? models.find((m) => m.id.startsWith(BYO_CHAT_PREFIX))
    : undefined;
}

/** The synthetic model backed by a BYO chat connection, keyed by its modelId. */
function buildChatConnectionModel(modelId: string, baseURL: string | null): Model {
  let host = "your provider";
  try {
    if (baseURL) host = new URL(baseURL).host;
  } catch {
    // Keep the fallback label.
  }
  return {
    id: `${BYO_CHAT_PREFIX}${modelId}`,
    name: modelId,
    // Just the host — the picker groups this under "Your provider" already, and
    // the host is the part that says WHICH provider.
    description: host,
    task: "text-generation",
    runtime: "server",
    chatConnection: true,
  };
}

/**
 * The BYO-chat model derived from the chat-provider store, or null. Non-React
 * accessor for conversation.ts, which must resolve a chat's pinned model outside
 * a component. The model is derived, not stored, so it can't go stale.
 */
export function chatConnectionModel(): Model | null {
  const { hasProvider, modelId, baseURL } = useChatProviderStore.getState();
  if (!hasProvider || !modelId) return null;
  return buildChatConnectionModel(modelId, baseURL);
}

/**
 * Non-React peer of useChatModels, for conversation.ts — which resolves a chat's
 * model outside a component. Both must offer the same catalog, or the transport
 * and the picker would disagree about what a chat is pinned to.
 */
export function chatModels(): Model[] {
  const byo = chatConnectionModel();
  return [...useModelStore.getState().models, ...(byo ? [byo] : [])];
}

/**
 * Catalog models plus the BYO-chat model (when a chat connection is set),
 * optionally filtered to a task. The picker reads this so the connection shows
 * up as a selectable model without being persisted into the store.
 */
export function useChatModels(task?: HfTask): Model[] {
  const models = useModelStore((s) => s.models);
  const hasProvider = useChatProviderStore((s) => s.hasProvider);
  const modelId = useChatProviderStore((s) => s.modelId);
  const baseURL = useChatProviderStore((s) => s.baseURL);

  const synthetic =
    hasProvider && modelId ? [buildChatConnectionModel(modelId, baseURL)] : [];
  const all = [...models, ...synthetic];
  return task ? all.filter((m) => m.task === task) : all;
}

/** Task classification of a chat's pinned model. */
export function taskForModel(modelId: string): HfTask {
  if (modelId.startsWith("byo-chat:")) return "text-generation";
  return (
    useModelStore.getState().models.find((m) => m.id === modelId)?.task ??
    "text-generation"
  );
}
