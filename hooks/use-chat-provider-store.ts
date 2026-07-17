import { createProviderStore } from "@/hooks/use-provider-store";

/**
 * The user's BYO chat connection — an OpenAI-compatible endpoint for chatting
 * against their own provider (a local Ollama, or a proprietary frontier model as
 * a baseline). Additive: the HF-token chat path (lib/hf-router) is untouched;
 * this is a peer.
 */
export const useChatProviderStore = createProviderStore("/api/chat-provider");
