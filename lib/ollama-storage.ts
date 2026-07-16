/**
 * Ollama disk management, from the browser. Ollama models are the user's own
 * pulls — often the biggest thing on disk (a 20B is ~14GB) — so a storage view
 * that ignored them would misrepresent usage.
 *
 * These use Ollama's NATIVE API (/api/tags, /api/delete), not the OpenAI-compat
 * surface: only the native one reports byte sizes and can remove a model. The
 * connection's base URL is `…:11434/v1`, so strip `/v1` to reach the root. CORS
 * is open for a reachable local Ollama (same server that serves /v1).
 */

function ollamaRoot(baseURL: string): string {
  return baseURL.replace(/\/+$/, "").replace(/\/v1$/, "");
}

/** Installed Ollama models with their on-disk size. [] if unreachable. */
export async function listOllamaModels(
  baseURL: string
): Promise<{ name: string; bytes: number }[]> {
  try {
    const res = await fetch(`${ollamaRoot(baseURL)}/api/tags`);
    if (!res.ok) return [];
    const body = (await res.json()) as {
      models?: { name?: string; size?: number }[];
    };
    return (body.models ?? [])
      .filter((m): m is { name: string; size?: number } => typeof m.name === "string")
      .map((m) => ({ name: m.name, bytes: m.size ?? 0 }))
      .sort((a, b) => b.bytes - a.bytes);
  } catch {
    return [];
  }
}

/** Remove an installed Ollama model, reclaiming its disk. */
export async function removeOllamaModel(
  baseURL: string,
  name: string
): Promise<void> {
  const res = await fetch(`${ollamaRoot(baseURL)}/api/delete`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Ollama couldn't remove ${name} (HTTP ${res.status}).`);
  }
}
