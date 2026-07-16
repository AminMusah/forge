/**
 * Compiles a generated playground's TSX to runnable JS, in the user's browser,
 * with esbuild-wasm. This is llamacoder's approach — no server, no remote build.
 *
 * Runs in the PARENT (Forge's page), not the sandboxed iframe: the parent
 * compiles, then injects the JS into the iframe's srcdoc. esbuild here is Forge's
 * own build tooling (like the codegen agent) — its wasm loading from a CDN is the
 * same category as loading a library, and doesn't touch the user's model or data.
 *
 * Cut-1 slice 2 uses `transform` (single-file JSX→JS). The real system will use
 * `build` + a resolve plugin for multi-file generated apps; this proves the wasm
 * loads and compiles under Next/Turbopack, which is the unknown.
 */

// Served from Forge's own origin (scripts/vendor-deps.mjs copies it from the
// installed esbuild-wasm on postinstall), so the wasm matches the JS API exactly
// and a public deploy doesn't depend on a CDN for its build tooling.
const ESBUILD_WASM_URL = "/vendor/esbuild.wasm";

let ready: Promise<typeof import("esbuild-wasm")> | null = null;

function getEsbuild(): Promise<typeof import("esbuild-wasm")> {
  // initialize() may run only ONCE per page — cache the whole init behind a
  // module-level promise so repeated compiles (and re-renders) reuse it.
  ready ??= (async () => {
    const esbuild = await import("esbuild-wasm");
    try {
      await esbuild.initialize({ wasmURL: ESBUILD_WASM_URL });
    } catch (error) {
      // A hot reload can re-enter after esbuild is already initialized; that
      // specific failure is safe to ignore, anything else is real.
      if (!String(error).includes('"initialize" was called more than once')) {
        ready = null;
        throw error;
      }
    }
    return esbuild;
  })();
  return ready;
}

/** TSX → ESM JS. Imports (react, forge substrate) are left for the iframe's import map. */
export async function compilePlayground(tsx: string): Promise<string> {
  const esbuild = await getEsbuild();
  const { code } = await esbuild.transform(tsx, {
    loader: "tsx",
    // The automatic runtime imports from "react/jsx-runtime" — the iframe's
    // import map resolves it, so the generated code never writes `import React`.
    jsx: "automatic",
    format: "esm",
    target: "es2020",
  });
  return code;
}
