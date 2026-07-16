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

/** The httpOnly cookie holding the JSON-encoded connection (apiKey included). */
export const CODEGEN_COOKIE = "codegen_conn";

export interface CodegenConnection {
  baseURL: string;
  apiKey: string;
  modelId: string;
}

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
export function parseCodegenConnection(
  raw: string | undefined
): CodegenConnection | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CodegenConnection>;
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

/** True for a localhost base URL (reachable only from the browser). */
export function isLocalBaseURL(baseURL: string): boolean {
  try {
    const host = new URL(baseURL).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}
