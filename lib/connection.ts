/**
 * A BYO connection: an OpenAI-compatible endpoint the user brings, so their own
 * quota powers the work. Shared by BOTH the chat provider and the codegen
 * provider — same shape, same cookie handling, same verification; they differ
 * only in which cookie they own.
 *
 * It lives at lib/ rather than lib/playground/ because chat depends on it too,
 * and a chat credential declared inside the playground namespace is how the
 * chat routes ended up importing from a module named for a feature they don't use.
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

/** A picker entry. Data only — adding a provider is never a code change. */
export interface ProviderPreset {
  label: string;
  baseURL: string;
  /** A sane default coder to prefill; the user can override it. */
  defaultModelId: string;
  /** Where to mint a key, shown as a hint. Omitted for keyless local. */
  keyUrl?: string;
}

/**
 * Presets lead with open endpoints (HF router, Groq's open models, local Ollama)
 * — proprietary providers are available but not the front door. Both Anthropic
 * and Google expose OpenAI-compatible base URLs, so they fit the same seam.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
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
 * Whether a localhost provider is worth offering AT ALL — true only when Forge
 * itself is served from loopback.
 *
 * The test is the PAGE's origin, not NODE_ENV, because the page origin is what
 * actually decides whether the browser may reach loopback. A hosted page is
 * blocked twice over: Chrome's Private Network Access refuses public→private
 * requests unless the local server opts in (Ollama doesn't), and an https page
 * can't call http anyway. But `next build && next start` on your own machine is
 * NODE_ENV=production and works fine — so gating on NODE_ENV would hide a
 * provider that genuinely works.
 *
 * Browser-only by nature; false during SSR, so callers must resolve it after
 * mount or the server and client renders will disagree.
 */
export function localProvidersAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return isLocalBaseURL(window.location.origin);
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
