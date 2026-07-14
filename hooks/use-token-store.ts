import { create } from "zustand";

interface TokenStore {
  /** Null until checked — the cookie is httpOnly, so we must ask the server. */
  hasToken: boolean | null;
  refresh: () => Promise<void>;
  save: (token: string) => Promise<void>;
  clear: () => Promise<void>;
}

async function readError(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Something went wrong.";
}

export const useTokenStore = create<TokenStore>((set) => ({
  hasToken: null,
  refresh: async () => {
    try {
      const res = await fetch("/api/token");
      const { hasToken } = (await res.json()) as { hasToken: boolean };
      set({ hasToken });
    } catch {
      set({ hasToken: false });
    }
  },
  save: async (token) => {
    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw new Error(await readError(res));
    set({ hasToken: true });
  },
  clear: async () => {
    await fetch("/api/token", { method: "DELETE" });
    set({ hasToken: false });
  },
}));
