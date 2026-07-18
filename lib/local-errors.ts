import {
  LOCAL_ENDPOINT_WHEN_HOSTED,
  localProvidersAvailable,
} from "@/lib/connection";

/**
 * Turns failures from a LOCAL (Ollama) endpoint into a plain next step. The
 * client-side counterpart of the worker's friendlyError() — used only on the
 * local chat/codegen paths, so it never touches the HF or cloud error handling.
 * Known cases become actionable text; anything unrecognised passes through.
 */
export function friendlyLocalError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Ollama reached, but the requested model isn't pulled.
  const notFound = /model ['"]?([^'"]+?)['"]? not found|404/i.exec(message);
  if (notFound) {
    const model = notFound[1];
    return model
      ? `Model "${model}" isn't installed. Pull it (\`ollama pull ${model}\`) or pick another from the list.`
      : "That model isn't installed. Pull it in Ollama, or pick another.";
  }

  // The browser couldn't reach the endpoint at all. On a hosted page that's
  // structural, not configuration — say so instead of sending the user off to
  // set OLLAMA_ORIGINS, which cannot help there.
  if (/failed to fetch|networkerror|load failed|econnrefused|fetch failed/i.test(message)) {
    return localProvidersAvailable()
      ? "Couldn't reach the local server. Is Ollama running?"
      : LOCAL_ENDPOINT_WHEN_HOSTED;
  }

  return message;
}
