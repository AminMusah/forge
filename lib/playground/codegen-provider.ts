import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { Connection } from "@/lib/connection";
import { fetchGuarded } from "@/lib/connection-policy";
import { hfModel } from "@/lib/hf-router";

/**
 * The codegen model — the cloud AI that writes playground UIs.
 *
 * Resolution (encoded across here and app/api/codegen/route.ts):
 *   1. the user's BYO connection — their key, their quota. Unlimited. Never
 *      falls back: a BYO failure is the user's own key to fix.
 *   2. the user's HF token, on the router's coder — their own quota, unlimited.
 *      A depleted token (402) falls through to 3 rather than dead-ending: it's
 *      a credential Forge asked them to add, so Forge owns the failure.
 *   3. the free shared key — Groq, but only for a visitor's first
 *      FREE_CODEGEN_LIMIT generations, and only when the operator opts in
 *      (FORGE_FREE_CODEGEN=1 + GROQ_API_KEY). The first-run taste.
 *   4. null — nothing available; the route answers 402 "add your own key".
 *
 * The shared key is deliberately gated AND capped: /api/codegen has no auth, so
 * an ungated shared key is an unmetered LLM proxy on the operator's account. The
 * per-browser counter cookie (see the route) is only a speed bump for honest
 * visitors; edge rate limiting is what stops a script, and the account's own
 * ceiling — a spend limit on a paid tier, or the org-wide rate budget on the
 * free one — is what bounds the rest. See .env.example. Every provider is
 * reached through ONE OpenAI-compatible seam: a provider is just a base URL.
 */

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_CODEGEN_MODEL = "openai/gpt-oss-120b";

// The coder the HF-token path runs, provider-pinned (":fastest") so the router's
// automatic provider selection can't whiff on a long-tail model. One named
// constant, like GROQ_CODEGEN_MODEL, so swapping in a better open coder later is
// a one-line change. Matches the Hugging Face preset default in lib/connection.ts.
const HF_CODEGEN_MODEL = "Qwen/Qwen3-Coder-480B-A35B-Instruct:fastest";

/**
 * Free playgrounds per browser, ON A HOSTED DEPLOY. Enough to actually feel the
 * loop — generate, see it run, try another task — rather than a single shot the
 * visitor spends before understanding what they got.
 *
 * Raising it multiplies the operator's worst case proportionally, and on Groq's
 * free tier that cost is paid in SHARED RATE, not money: the token-per-minute
 * budget is org-wide, so a generous allowance here shows up as 429s for other
 * visitors. Running the repo locally isn't metered at all — the key is the
 * developer's own, so there's no third party to protect.
 */
export const FREE_CODEGEN_LIMIT = 3;

export interface CodegenModel {
  model: LanguageModel;
}

function openAICompatible(
  name: string,
  baseURL: string,
  apiKey: string,
  modelId: string
): LanguageModel {
  return createOpenAICompatible({ name, baseURL, apiKey, fetch: fetchGuarded })(
    modelId
  );
}

/** The user's own BYO codegen model, or null if they haven't configured one. */
export function codegenModel(
  opts: { connection?: Connection | null } = {}
): CodegenModel | null {
  const { connection } = opts;
  if (connection) {
    return {
      model: openAICompatible("byo", connection.baseURL, connection.apiKey, connection.modelId),
    };
  }

  return null;
}

/**
 * The free shared coder, or null. Gated behind the operator's explicit opt-in, so
 * a cloned Forge that doesn't set the operator's key stays strictly BYO. The
 * route calls this only while the visitor is under FREE_CODEGEN_LIMIT.
 */
export function freeCodegenModel(): CodegenModel | null {
  const key = process.env.GROQ_API_KEY;
  if (process.env.FORGE_FREE_CODEGEN === "1" && key) {
    return {
      model: openAICompatible("groq", GROQ_BASE_URL, key, GROQ_CODEGEN_MODEL),
    };
  }
  return null;
}

/**
 * Codegen on the user's OWN Hugging Face token, via the router — their HF quota,
 * HF-native, unlimited. Ranks ABOVE the free Groq doormat in the route because
 * it's the user's own credential and never burdens the operator's shared key.
 * The token is the same hf_token cookie that powers cloud chat.
 */
export function hfCodegenModel(apiKey: string): CodegenModel {
  return { model: hfModel({ apiKey, modelId: HF_CODEGEN_MODEL }) };
}
