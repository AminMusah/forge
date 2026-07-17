import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { Connection } from "@/lib/playground/codegen-connection";

/**
 * The codegen model — the cloud AI that writes playground UIs.
 *
 * Resolution, deliberately (see forge-byo-key-design):
 *   1. the user's BYO connection (their key, their quota) — the only path.
 *   2. null — nothing configured; the route answers 401 "add a codegen key".
 *
 * Codegen is strictly bring-your-own: Forge holds NO provider key of its own
 * (see app/api/chat/route.ts:28-29). There is deliberately no shared server-side
 * default, because Forge is deployed at a public URL and a shared key on this
 * unauthenticated route would be an unmetered LLM proxy on the operator's bill.
 * A first-time user's "taste" comes from an in-browser model, not a shared key.
 *
 * Every provider is reached through ONE OpenAI-compatible seam — a provider is
 * just a base URL.
 */

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
