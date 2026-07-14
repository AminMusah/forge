import { cookies } from "next/headers";
import { z } from "zod";

export const TOKEN_COOKIE = "hf_token";

const bodySchema = z.object({
  token: z.string().min(1).max(200),
});

/** Reports whether a token is stored — never the token itself. */
export async function GET() {
  const store = await cookies();
  return Response.json({ hasToken: store.has(TOKEN_COOKIE) });
}

/** Verifies the token with Hugging Face, then stores it httpOnly. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "A token is required." }, { status: 400 });
  }
  const token = parsed.data.token.trim();

  // Catch typos and revoked tokens here, rather than as a confusing reply
  // failure on the user's first message.
  let whoami: Response;
  try {
    whoami = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return Response.json(
      { error: "Could not reach Hugging Face. Check your connection." },
      { status: 502 }
    );
  }

  if (!whoami.ok) {
    return Response.json(
      { error: "That token was rejected by Hugging Face." },
      { status: 401 }
    );
  }

  const user = (await whoami.json()) as { name?: string };

  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return Response.json({ hasToken: true, name: user.name ?? null });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  return Response.json({ hasToken: false });
}
