import { cookies } from "next/headers";
import { z } from "zod";

import {
  LOCAL_ENDPOINT_WHEN_HOSTED,
  isLocalBaseURL,
  parseConnection,
} from "@/lib/connection";
import {
  assertFetchableBaseURL,
  isHostedDeploy,
  UNREACHABLE,
} from "@/lib/connection-policy";

/**
 * The BYO-connection endpoint, shared by chat and codegen. Both hold the same
 * `{ baseURL, apiKey, modelId }` in an httpOnly cookie so the key never reaches
 * browser JS, both report back only the non-secret fields, and both verify a
 * cloud endpoint the same way. They differ in one thing: which cookie they own.
 *
 * Server-only — this imports next/headers, which is why it lives here rather
 * than in lib/connection.ts, which is isomorphic on purpose.
 */

const bodySchema = z.object({
  baseURL: z.string().url().max(500),
  // Optional: a localhost endpoint (Ollama) needs no key. A cloud endpoint with
  // an empty key simply fails the /models check below.
  apiKey: z.string().max(400).optional(),
  modelId: z.string().min(1).max(200),
});

export function providerRoute(cookieName: string) {
  /** Reports what's stored — the baseURL and modelId, never the key. */
  const GET = async () => {
    const conn = parseConnection((await cookies()).get(cookieName)?.value);
    return Response.json(
      conn
        ? { hasProvider: true, baseURL: conn.baseURL, modelId: conn.modelId }
        : { hasProvider: false }
    );
  };

  /** Verifies the connection against `GET {baseURL}/models`, then stores it. */
  const POST = async (req: Request) => {
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
      return Response.json(
        { error: "That base URL isn't valid." },
        { status: 400 }
      );
    }

    // A localhost endpoint on a hosted Forge is a dead end: this server can't
    // reach the user's machine, and the local story on a deploy is the in-browser
    // WebGPU model, not the user's own Ollama. Reject it rather than store a
    // connection that can never work. Locally (next dev) it's the intended path.
    if (isLocalBaseURL(baseURL) && isHostedDeploy()) {
      return Response.json(
        { error: LOCAL_ENDPOINT_WHEN_HOSTED },
        { status: 400 }
      );
    }

    // A localhost endpoint is only reachable from the browser, not this server —
    // the client verified it before POSTing, and the model runs client-side too.
    // For a cloud endpoint, catch a bad key or wrong URL HERE, not as a confusing
    // failure on the first message. /models is standard and free; a 404 means the
    // endpoint is reachable but has no catalog (some servers) — a soft pass.
    if (!isLocalBaseURL(baseURL)) {
      // Constrain what the server will fetch: reject non-http(s) schemes always,
      // and on a hosted deploy refuse private/loopback/link-local targets, so the
      // route can't be aimed at the operator's own network (SSRF).
      try {
        await assertFetchableBaseURL(baseURL);
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : UNREACHABLE },
          { status: 400 }
        );
      }

      // A hosted deploy answers every verification failure identically: the
      // difference between "unreachable", "key rejected" and "HTTP 500" is a
      // readout of what the host can reach. Locally it's just a useful error.
      const fail = (message: string, status: number) =>
        isHostedDeploy()
          ? Response.json({ error: UNREACHABLE }, { status: 502 })
          : Response.json({ error: message }, { status });

      let res: Response;
      try {
        res = await fetch(`${baseURL}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      } catch {
        return fail(`Couldn't reach ${host}. Check the base URL.`, 502);
      }

      if (res.status === 401 || res.status === 403) {
        return fail(`That key was rejected by ${host}.`, 401);
      }
      // Anything other than OK or a missing-catalog 404 is a real problem.
      if (!res.ok && res.status !== 404) {
        return fail(`${host} rejected the connection (HTTP ${res.status}).`, 502);
      }
    }

    const store = await cookies();
    store.set(cookieName, JSON.stringify({ baseURL, apiKey, modelId }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return Response.json({ hasProvider: true, baseURL, modelId });
  };

  const DELETE = async () => {
    const store = await cookies();
    store.delete(cookieName);
    return Response.json({ hasProvider: false });
  };

  return { GET, POST, DELETE };
}
