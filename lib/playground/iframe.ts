import { FORGE_SDK_SOURCE } from "@/lib/playground/bridge";

/**
 * Wraps a compiled playground module into the sandboxed-iframe document it runs
 * in. The shell every generated playground shares: an import map that resolves
 * the substrate, the injected `forge` SDK, and the compiled code as a module.
 *
 * Deliberately not React-specific in what it hosts — only the generated code is.
 */

/** Bare specifiers → pinned esm.sh. `?external=react` keeps ONE react instance
 *  (react-dom importing its own copy causes "invalid hook call"). */
const IMPORT_MAP = {
  imports: {
    react: "https://esm.sh/react@19.2.4",
    "react/jsx-runtime": "https://esm.sh/react@19.2.4/jsx-runtime",
    "react-dom": "https://esm.sh/react-dom@19.2.4?external=react",
    "react-dom/client": "https://esm.sh/react-dom@19.2.4/client?external=react",
  },
};

/**
 * The HTML parser ends script data at the first `</script`, wherever it occurs —
 * including inside a JS string literal, which esbuild preserves verbatim. A
 * generated playground that so much as mentions the closing tag in a label would
 * terminate its own module early and render blank, and compilation SUCCEEDS, so
 * the auto-fix loop never sees an error to fix.
 *
 * `<\/script` is the same string to JavaScript and invisible to the HTML parser.
 * Scoped to `</script` on purpose: escaping every `</` would corrupt regex
 * literals like /a</ .
 */
const escapeScriptClose = (js: string) => js.replace(/<\/script/gi, "<\\/script");

export function buildPlaygroundSrcdoc(compiledJs: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b0b0c; color: #e7e7e9; padding: 16px; font: 14px system-ui, sans-serif; }
</style>
</head>
<body>
<div id="root"></div>
<script>${FORGE_SDK_SOURCE}</script>
<script type="module">
${escapeScriptClose(compiledJs)}
</script>
</body>
</html>`;
}
