import { useCodegenProviderStore } from "@/hooks/use-codegen-provider-store";
import type { HfTask } from "@/lib/hf-tasks";
import { friendlyLocalError } from "@/lib/local-errors";
import {
  buildCodegenPrompt,
  extractCode,
} from "@/lib/playground/codegen-prompt";
import { isLocalBaseURL } from "@/lib/connection";
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

/**
 * A codegen failure that remembers its HTTP status, so the UI can tell a DEAD
 * END from a hiccup. 402 means the free allowance is gone and no amount of
 * retrying will change that until a key arrives; a 502 or a 429 is worth trying
 * again, and often works on the second attempt — codegen isn't deterministic.
 */
export class CodegenError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "CodegenError";
  }
}

export interface CodegenRequest {
  task: string;
  /** Fresh generation: what to build. */
  request?: string;
  /** Modify/fix: the current file to edit. */
  previousCode?: string;
  /** The change to apply (a user modification, or a compile-error fix). */
  instruction?: string;
}

export async function requestPlayground(
  body: CodegenRequest,
  signal?: AbortSignal
): Promise<string> {
  const { hasProvider, baseURL, modelId } = useCodegenProviderStore.getState();
  if (hasProvider && baseURL && modelId && isLocalBaseURL(baseURL)) {
    return requestLocal(body, baseURL, modelId, signal);
  }
  return requestServer(body, signal);
}

async function requestServer(
  body: CodegenRequest,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch("/api/codegen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  // Not every rejection comes from our route: an edge rate-limit rule answers
  // before the function runs. Read the body defensively — it may be absent, or
  // JSON in a shape we didn't write.
  const data = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    // Our route always answers { error: "<string>" } and its messages already
    // say what to do next, so they win. An OBJECT under `error` came from
    // somewhere else — an edge rate-limit rule answers { error: { message:
    // "Forbidden" } }, which names no next step — so speak for it instead.
    const own = typeof (data as { error?: unknown } | null)?.error === "string"
      ? ((data as { error: string }).error || null)
      : null;
    if (own) throw new CodegenError(own, res.status);

    throw new CodegenError(
      res.status === 429 || res.status === 403
        ? "Too many requests just now. Wait a minute and try again."
        : errorText(data) ?? `Codegen failed (HTTP ${res.status}).`,
      res.status
    );
  }

  const code = (data as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !code) {
    throw new Error("Codegen returned no code.");
  }
  return code;
}

/**
 * Pull a readable message out of an error body. Ours is `{ error: string }`;
 * an edge or proxy may send `{ error: { message, code, id } }` instead — passing
 * that object straight to Error() is what renders "[object Object]" at the user.
 */
function errorText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const error = (data as { error?: unknown }).error;
  if (typeof error === "string") return error || null;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message || null;
  }
  return null;
}

/** Generate against a local endpoint directly from the browser (no server hop). */
async function requestLocal(
  body: CodegenRequest,
  baseURL: string,
  modelId: string,
  signal?: AbortSignal
): Promise<string> {
  const descriptor = descriptorFor(body.task as HfTask);
  if (!descriptor) throw new Error(`No playground descriptor for ${body.task}.`);

  const { system, prompt } = buildCodegenPrompt(
    body.task,
    descriptor,
    body.request ?? "",
    { previousCode: body.previousCode, instruction: body.instruction }
  );

  // Loaded here, not at module scope: this branch only runs for a LOCAL (Ollama)
  // codegen provider, and the module is reachable from the playground surface —
  // no reason to ship the provider SDK to everyone who never takes this path.
  const [{ createOpenAICompatible }, { generateText }] = await Promise.all([
    import("@ai-sdk/openai-compatible"),
    import("ai"),
  ]);

  // A local endpoint (Ollama) ignores auth; a placeholder key satisfies clients
  // that always attach a bearer.
  const model = createOpenAICompatible({
    name: "local-codegen",
    baseURL,
    apiKey: "local",
  })(modelId);

  try {
    // A cap bounds a runaway — a reasoning model (e.g. gpt-oss) can otherwise
    // "think" for many thousands of tokens and never stop. 8000 still leaves
    // ample room for a single-file playground (~2-4k) plus its reasoning; raise
    // it if a large generation truncates. (The Stop button is the manual escape.)
    const { text } = await generateText({
      model,
      system,
      prompt,
      maxOutputTokens: 8000,
      maxRetries: 1,
      abortSignal: signal,
    });

    const code = extractCode(text);
    if (!code) throw new Error("The model returned no code.");
    return code;
  } catch (error) {
    // Let an abort surface as-is so the caller can tell "stopped" from "failed".
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(friendlyLocalError(error));
  }
}
