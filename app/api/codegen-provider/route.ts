import { CODEGEN_COOKIE } from "@/lib/playground/codegen-connection";
import { providerRoute } from "@/lib/provider-route";

/**
 * The user's BYO codegen connection — the OpenAI-compatible endpoint that writes
 * playground UIs, on their key and their quota rather than Forge's shared
 * default.
 */
const handlers = providerRoute(CODEGEN_COOKIE);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
