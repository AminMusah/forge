import { createProviderStore } from "@/hooks/use-provider-store";

/**
 * The user's BYO codegen connection — the endpoint that writes playground UIs,
 * running on their key and their quota rather than Forge's shared default.
 */
export const useCodegenProviderStore = createProviderStore(
  "/api/codegen-provider"
);
