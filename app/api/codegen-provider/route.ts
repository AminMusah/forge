import { cookies } from "next/headers";
import { z } from "zod";

import {
  CODEGEN_COOKIE,
  isLocalBaseURL,
  parseCodegenConnection,
} from "@/lib/playground/codegen-connection";

/**
 * The user's BYO codegen connection (an OpenAI-compatible endpoint). Mirrors
 * app/api/token: stored httpOnly so the apiKey never reaches browser JS; GET
 * reports only the NON-secret fields (baseURL, modelId) so the panel can show
 * what's configured without ever echoing the key back.
 */

const bodySchema = z.object({
  baseURL: z.string().url().max(500),
  // Optional: a localhost endpoint (Ollama) needs no key. A cloud endpoint with
  // an empty key simply fails the /models check below.
  apiKey: z.string().max(400).optional(),
  modelId: z.string().min(1).max(200),
});

/** Reports what's stored — the baseURL and modelId, never the key. */
export async function GET() {
  const conn = parseCodegenConnection((await cookies()).get(CODEGEN_COOKIE)?.value);
  return Response.json(
    conn
      ? { hasProvider: true, baseURL: conn.baseURL, modelId: conn.modelId }
      : { hasProvider: false }
  );
}

/** Verifies the connection against `GET {baseURL}/models`, then stores it. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "A base URL, API key and model id are required." },
      { status: 400 }
    );
  }
  const baseURL = parsed.data.baseURL.replace(/\/+$/, "");
  const apiKey = (parsed.data.apiKey ?? "").trim();
  const modelId = parsed.data.modelId.trim();

  let host: string;
  try {
    host = new URL(baseURL).host;
  } catch {
    return Response.json({ error: "That base URL isn't valid." }, { status: 400 });
  }

  // A localhost endpoint is only reachable from the browser, not this server —
  // the client verified it before POSTing, and the model runs client-side too.
  // For a cloud endpoint, catch a bad key or wrong URL HERE, not as a confusing
  // failure on first generation. /models is standard and free; a 404 means the
  // endpoint is reachable but has no catalog (some servers) — a soft pass.
  if (!isLocalBaseURL(baseURL)) {
    let res: Response;
    try {
      res = await fetch(`${baseURL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch {
      return Response.json(
        { error: `Couldn't reach ${host}. Check the base URL.` },
        { status: 502 }
      );
    }

    if (res.status === 401 || res.status === 403) {
      return Response.json(
        { error: `That key was rejected by ${host}.` },
        { status: 401 }
      );
    }
    // Anything other than OK or a missing-catalog 404 is a real problem.
    if (!res.ok && res.status !== 404) {
      return Response.json(
        { error: `${host} rejected the connection (HTTP ${res.status}).` },
        { status: 502 }
      );
    }
  }

  const store = await cookies();
  store.set(CODEGEN_COOKIE, JSON.stringify({ baseURL, apiKey, modelId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return Response.json({ hasProvider: true, baseURL, modelId });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(CODEGEN_COOKIE);
  return Response.json({ hasProvider: false });
}
