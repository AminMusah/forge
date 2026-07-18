import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { Connection } from "@/lib/connection";

/**
 * The codegen model — the cloud AI that writes playground UIs.
 *
 * Resolution (encoded across here and app/api/codegen/route.ts):
 *   1. the user's BYO connection — their key, their quota. Unlimited.
 *   2. the free shared key — Groq, but only for a visitor's first
 *      FREE_CODEGEN_LIMIT generations, and only when the operator opts in
 *      (FORGE_FREE_CODEGEN=1 + GROQ_API_KEY). The first-run taste.
 *   3. null — nothing available; the route answers 402 "add your own key".
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
  label: string;
}

function openAICompatible(
  name: string,
  baseURL: string,
  apiKey: string,
  modelId: string
): LanguageModel {
  return createOpenAICompatible({ name, baseURL, apiKey })(modelId);
}

/** The user's own BYO codegen model, or null if they haven't configured one. */
export function codegenModel(
  opts: { connection?: Connection | null } = {}
): CodegenModel | null {
  const { connection } = opts;
  if (connection) {
    return {
      model: openAICompatible("byo", connection.baseURL, connection.apiKey, connection.modelId),
      label: `BYO · ${connection.modelId}`,
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
      label: `Free · ${GROQ_CODEGEN_MODEL}`,
    };
  }
  return null;
}
