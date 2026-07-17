import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { Connection } from "@/lib/playground/codegen-connection";

/**
 * The codegen model — the cloud AI that writes playground UIs.
 *
 * Resolution order, deliberately (see forge-byo-key-design):
 *   1. the user's BYO connection (their key, their quota) — wins OUTRIGHT, with
 *      no fallback to the shared key, so a depleted user key never spills onto
 *      Forge's bill.
 *   2. the shared default (GROQ_API_KEY) — the zero-setup on-ramp for users who
 *      haven't brought a key.
 *   3. null — nothing configured; the route answers 401 "add a codegen key".
 *
 * Every provider is reached through ONE OpenAI-compatible seam — a provider is
 * just a base URL. The shared default is the same seam pointed at Groq.
 */

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_CODEGEN_MODEL = "openai/gpt-oss-120b";

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

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    return {
      model: openAICompatible("groq", GROQ_BASE_URL, groqKey, GROQ_CODEGEN_MODEL),
      label: `Groq · ${GROQ_CODEGEN_MODEL}`,
    };
  }

  return null;
}
