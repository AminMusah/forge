import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // transformers.js ships Node-only bindings it never needs in the browser.
  // Alias them away so they can't be pulled into the client bundle.
  turbopack: {
    resolveAlias: {
      "onnxruntime-node": { browser: "./lib/empty-module.ts" },
      sharp: { browser: "./lib/empty-module.ts" },
    },
  },
};

export default nextConfig;
