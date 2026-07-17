import { CHAT_COOKIE } from "@/lib/playground/codegen-connection";
import { providerRoute } from "@/lib/provider-route";

/**
 * The user's BYO chat connection — an OpenAI-compatible endpoint for chatting
 * against their own provider (a local Ollama, or a proprietary frontier model as
 * a baseline). Additive: the HF-token chat path (lib/hf-router) is untouched;
 * this is a peer transport.
 */
const handlers = providerRoute(CHAT_COOKIE);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
