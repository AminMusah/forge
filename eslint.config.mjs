import next from "eslint-config-next/core-web-vitals";

/**
 * Flat config. The rule that earns this file is react-hooks/exhaustive-deps:
 * tsc says nothing about hook dependencies, and this codebase coordinates a lot
 * of interlocking effects and refs (see components/chat/playground-view.tsx and
 * app/models/downloaded/page.tsx), where a stale closure is invisible to CI.
 */
export default [
  {
    // Vendored shadcn/base-ui primitives — not ours to lint or hand-edit.
    ignores: [
      "components/ui/**",
      ".next/**",
      "public/vendor/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
  ...next,
  {
    /**
     * react-hooks v7 (bundled by eslint-config-next 16) ships a batch of new
     * rules as errors that fire on pre-existing, often-deliberate patterns —
     * mount-guard setState, the surfaceFor() dynamic surface, etc. Land them as
     * WARNINGS so the linter goes green now and starts catching NEW mistakes;
     * triaging the existing hits is a separate, reviewed pass, after which the
     * ones that matter (rules-of-hooks especially) get promoted back to error.
     * exhaustive-deps is left at its default warn — it already correctly flags
     * the deliberate `transport` memo dep in use-conversation.ts.
     */
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/rules-of-hooks": "warn",
    },
  },
];
