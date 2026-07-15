import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

import { hfModel } from "@/lib/hf-router";

/**
 * The codegen model — the strong cloud AI that writes playground UIs.
 *
 * Deliberately its own seam, separate from the chat path (hfModel/text-gen):
 * codegen is user-choosable, BYO-key. Today it picks by which key is configured,
 * Groq first (fast, generous free tier). Later this becomes a user setting
 * (provider + pasted key, stored like the HF token) — the callers won't change.
 */

const GROQ_CODEGEN_MODEL = "openai/gpt-oss-120b";
const HF_CODEGEN_MODEL = "Qwen/Qwen3-Coder-480B-A35B-Instruct";

export interface CodegenModel {
  model: LanguageModel;
  label: string;
}

/**
 * Resolves the codegen model, or null if no provider is configured. `hfToken` is
 * the request's HF cookie — used only as a fallback, since the router's coder
 * models cost the user's HF credits while Groq's free tier doesn't.
 */
export function codegenModel(opts: { hfToken?: string } = {}): CodegenModel | null {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const groq = createGroq({ apiKey: groqKey });
    return { model: groq(GROQ_CODEGEN_MODEL), label: `Groq · ${GROQ_CODEGEN_MODEL}` };
  }

  if (opts.hfToken) {
    return {
      model: hfModel({ apiKey: opts.hfToken, modelId: HF_CODEGEN_MODEL }),
      label: `HF · ${HF_CODEGEN_MODEL}`,
    };
  }

  return null;
}
