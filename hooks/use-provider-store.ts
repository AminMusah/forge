import { create } from "zustand";

import {
  isLocalBaseURL,
  verifyLocalConnection,
} from "@/lib/connection";

/**
 * A BYO connection as the client sees it. The apiKey lives in an httpOnly cookie
 * the browser can't read, so the store asks the server whether one is set and
 * gets back only the NON-secret fields — enough to show what's configured and
 * prefill the form, without ever echoing the key back.
 *
 * Chat and codegen each get a store from this factory. They are the same
 * plumbing pointed at a different endpoint: same credential shape, same httpOnly
 * discipline, same split over who verifies a local endpoint. If they ever need
 * to differ, that's the signal to pull them apart again rather than to grow a
 * flag here.
 */
export interface ProviderStore {
  /** Null until checked — the cookie is httpOnly, so we must ask the server. */
  hasProvider: boolean | null;
  baseURL: string | null;
  modelId: string | null;
  refresh: () => Promise<void>;
  save: (conn: {
    baseURL: string;
    apiKey: string;
    modelId: string;
  }) => Promise<void>;
  clear: () => Promise<void>;
}

async function readError(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Something went wrong.";
}

export function createProviderStore(endpoint: string) {
  return create<ProviderStore>((set) => ({
    hasProvider: null,
    baseURL: null,
    modelId: null,
    refresh: async () => {
      try {
        const res = await fetch(endpoint);
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
      // A hosted server can't reach the user's localhost, so verify a local
      // endpoint here in the browser; the server route skips its own check for it.
      if (isLocalBaseURL(conn.baseURL)) {
        await verifyLocalConnection(conn.baseURL, conn.apiKey);
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(conn),
      });
      if (!res.ok) throw new Error(await readError(res));
      set({ hasProvider: true, baseURL: conn.baseURL, modelId: conn.modelId });
    },
    clear: async () => {
      await fetch(endpoint, { method: "DELETE" });
      set({ hasProvider: false, baseURL: null, modelId: null });
    },
  }));
}
