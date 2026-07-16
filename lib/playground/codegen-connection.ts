/**
 * The BYO codegen connection: an OpenAI-compatible endpoint the user brings, so
 * their own quota — not Forge's shared key — powers playground generation.
 *
 * ONE credential shape for every provider: `{ baseURL, apiKey, modelId }`. Groq,
 * OpenAI, Gemini, Anthropic, OpenRouter and a local Ollama all speak the OpenAI
 * wire format, so a single seam covers them — a provider is just a base URL.
 *
 * This module is isomorphic on purpose (no server-only imports): the presets are
 * public data the settings panel renders, and the cookie parser runs server-side
 * where the httpOnly cookie is readable. The apiKey never leaves the server.
 */

/** The httpOnly cookies holding a JSON-encoded connection (apiKey included). */
export const CODEGEN_COOKIE = "codegen_conn";
export const CHAT_COOKIE = "chat_conn";

export interface Connection {
  baseURL: string;
  apiKey: string;
  modelId: string;
}

/** Back-compat alias — codegen was the first consumer of this shape. */
export type CodegenConnection = Connection;

/** A picker entry. Data only — adding a provider is never a code change. */
export interface CodegenPreset {
  label: string;
  baseURL: string;
  /** A sane default coder to prefill; the user can override it. */
  defaultModelId: string;
  /** Where to mint a key, shown as a hint. Omitted for keyless local. */
  keyUrl?: string;
  /** True for localhost endpoints — reachable only from the browser, not a
   * hosted server. The Ollama/local path is deferred, but the flag is here so
   * the UI can note it and later routing can branch on it. */
  local?: boolean;
}

/**
 * Presets lead with open endpoints (HF router, Groq's open models, local Ollama)
 * — proprietary providers are available but not the front door. Both Anthropic
 * and Google expose OpenAI-compatible base URLs, so they fit the same seam.
 */
export const CODEGEN_PRESETS: CodegenPreset[] = [
  {
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModelId: "openai/gpt-oss-120b",
    keyUrl: "https://console.groq.com/keys",
  },
  {
    label: "Hugging Face",
    baseURL: "https://router.huggingface.co/v1",
    defaultModelId: "Qwen/Qwen3-Coder-480B-A35B-Instruct:fastest",
    keyUrl: "https://huggingface.co/settings/tokens",
  },
  {
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModelId: "qwen/qwen3-coder",
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    defaultModelId: "gpt-4.1",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModelId: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    label: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    defaultModelId: "claude-sonnet-4-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    label: "Local (Ollama)",
    baseURL: "http://localhost:11434/v1",
    defaultModelId: "qwen2.5-coder",
    local: true,
  },
];

/** Parse the raw cookie value into a connection, or null if absent/malformed. */
export function parseConnection(raw: string | undefined): Connection | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Connection>;
    if (
      typeof value.baseURL === "string" &&
      typeof value.apiKey === "string" &&
      typeof value.modelId === "string"
    ) {
      return { baseURL: value.baseURL, apiKey: value.apiKey, modelId: value.modelId };
    }
  } catch {
    // Malformed cookie — treat as no connection.
  }
  return null;
}

/** Back-compat alias for the first consumer (codegen). */
export const parseCodegenConnection = parseConnection;

/** True for a localhost base URL (reachable only from the browser). */
export function isLocalBaseURL(baseURL: string): boolean {
  try {
    const host = new URL(baseURL).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * List the models an OpenAI-compatible endpoint has, from the browser. Used to
 * populate the model picker for LOCAL (Ollama) endpoints — the server can't
 * reach the user's localhost, but the browser can, and CORS is open there.
 * Returns [] on any failure (the field falls back to free-text).
 */
export async function listLocalModels(
  baseURL: string,
  apiKey: string
): Promise<string[]> {
  try {
    const res = await fetch(`${baseURL.replace(/\/+$/, "")}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { id?: string }[] };
    return (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/**
 * Verify a LOCAL connection FROM THE BROWSER. A hosted server can't reach the
 * user's localhost, so localhost endpoints are verified (and later called)
 * client-side. Same checks the server route runs for cloud endpoints. Throws a
 * friendly error when unreachable or the key is rejected.
 */
export async function verifyLocalConnection(
  baseURL: string,
  apiKey: string
): Promise<void> {
  let host: string;
  try {
    host = new URL(baseURL).host;
  } catch {
    throw new Error("That base URL isn't valid.");
  }
  let res: Response;
  try {
    res = await fetch(`${baseURL.replace(/\/+$/, "")}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
  } catch {
    throw new Error(
      `Couldn't reach ${host}. Is the local server running, with this origin allowed (e.g. OLLAMA_ORIGINS)?`
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`That key was rejected by ${host}.`);
  }
  if (!res.ok && res.status !== 404) {
    throw new Error(`${host} rejected the connection (HTTP ${res.status}).`);
  }
}
