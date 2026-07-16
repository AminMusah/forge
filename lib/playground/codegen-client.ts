import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

import { useCodegenProviderStore } from "@/hooks/use-codegen-provider-store";
import type { HfTask } from "@/lib/hf-tasks";
import {
  buildCodegenPrompt,
  extractCode,
} from "@/lib/playground/codegen-prompt";
import { isLocalBaseURL } from "@/lib/playground/codegen-connection";
import { descriptorFor } from "@/lib/playground/descriptors";

/**
 * Client-side wrapper for codegen. Thin on purpose — the orchestration
 * (compile, auto-fix, versioning) lives with the UI state that owns it.
 *
 * A cloud provider (or the shared default) runs on the server (/api/codegen),
 * keeping the key httpOnly. A LOCAL (Ollama) provider runs HERE in the browser:
 * a hosted server can't reach the user's localhost, and a keyless local endpoint
 * has nothing to protect — so the same seam decides both where the model runs
 * and where the key may live.
 */

export interface CodegenRequest {
  task: string;
  /** Fresh generation: what to build. */
  request?: string;
  /** Modify/fix: the current file to edit. */
  previousCode?: string;
  /** The change to apply (a user modification, or a compile-error fix). */
  instruction?: string;
}

export async function requestPlayground(body: CodegenRequest): Promise<string> {
  const { hasProvider, baseURL, modelId } = useCodegenProviderStore.getState();
  if (hasProvider && baseURL && modelId && isLocalBaseURL(baseURL)) {
    return requestLocal(body, baseURL, modelId);
  }
  return requestServer(body);
}

async function requestServer(body: CodegenRequest): Promise<string> {
  const res = await fetch("/api/codegen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Codegen failed.");
  return data.code as string;
}

/** Generate against a local endpoint directly from the browser (no server hop). */
async function requestLocal(
  body: CodegenRequest,
  baseURL: string,
  modelId: string
): Promise<string> {
  const descriptor = descriptorFor(body.task as HfTask);
  if (!descriptor) throw new Error(`No playground descriptor for ${body.task}.`);

  const { system, prompt } = buildCodegenPrompt(
    body.task,
    descriptor,
    body.request ?? "",
    { previousCode: body.previousCode, instruction: body.instruction }
  );

  // A local endpoint (Ollama) ignores auth; a placeholder key satisfies clients
  // that always attach a bearer.
  const model = createOpenAICompatible({
    name: "local-codegen",
    baseURL,
    apiKey: "local",
  })(modelId);

  const { text } = await generateText({
    model,
    system,
    prompt,
    maxOutputTokens: 4000,
    maxRetries: 1,
  });

  const code = extractCode(text);
  if (!code) throw new Error("The model returned no code.");
  return code;
}
