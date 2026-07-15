/**
 * Client-side wrapper for /api/codegen. Thin on purpose — the orchestration
 * (compile, auto-fix, versioning) lives with the UI state that owns it. Shared
 * so PlaygroundView can reuse it when the spike graduates into the app.
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
  const res = await fetch("/api/codegen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Codegen failed.");
  return data.code as string;
}
