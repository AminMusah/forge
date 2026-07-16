// Vendors esbuild.wasm into public/vendor/ so Forge serves the in-browser
// compiler from its OWN origin instead of unpkg — removing a supply-chain +
// availability dependency (a 14MB core dependency from a CDN) for a public
// deploy. It's fetched by Forge's own page (compile.ts), so it's same-origin and
// needs no CORS.
//
// Output is generated (gitignored), not committed: run on postinstall so a fresh
// clone has it after `pnpm install`.
//
// NOTE: the playground iframe still imports React from esm.sh (see iframe.ts).
// That's deliberate — esm.sh's `?external=react` guarantees a single React
// instance for the sandboxed iframe, which a hand-rolled bundle of React 19's
// internals does not (it duplicates ReactSharedInternals -> "invalid hook call").

import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "public", "vendor");

await mkdir(outDir, { recursive: true });
const wasm = require.resolve("esbuild-wasm/esbuild.wasm");
await copyFile(wasm, join(outDir, "esbuild.wasm"));
console.log("vendored esbuild.wasm");
