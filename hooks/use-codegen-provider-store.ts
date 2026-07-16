import { create } from "zustand";

/**
 * The user's BYO codegen connection, seen from the client. Like the HF token,
 * the apiKey lives in an httpOnly cookie the browser can't read — so we ask the
 * server whether one is set and get back only the NON-secret fields (baseURL,
 * modelId) to show what's configured and prefill the form.
 */
interface CodegenProviderStore {
  /** Null until checked — the cookie is httpOnly, so we must ask the server. */
  hasProvider: boolean | null;
  baseURL: string | null;
  modelId: string | null;
  refresh: () => Promise<void>;
  save: (conn: { baseURL: string; apiKey: string; modelId: string }) => Promise<void>;
  clear: () => Promise<void>;
}

async function readError(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Something went wrong.";
}

export const useCodegenProviderStore = create<CodegenProviderStore>((set) => ({
  hasProvider: null,
  baseURL: null,
  modelId: null,
  refresh: async () => {
    try {
      const res = await fetch("/api/codegen-provider");
      const data = (await res.json()) as {
        hasProvider: boolean;
        baseURL?: string;
        modelId?: string;
      };
      set({
        hasProvider: data.hasProvider,
        baseURL: data.baseURL ?? null,
        modelId: data.modelId ?? null,
      });
    } catch {
      set({ hasProvider: false });
    }
  },
  save: async (conn) => {
    const res = await fetch("/api/codegen-provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(conn),
    });
    if (!res.ok) throw new Error(await readError(res));
    set({ hasProvider: true, baseURL: conn.baseURL, modelId: conn.modelId });
  },
  clear: async () => {
    await fetch("/api/codegen-provider", { method: "DELETE" });
    set({ hasProvider: false, baseURL: null, modelId: null });
  },
}));
