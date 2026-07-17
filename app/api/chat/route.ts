import { cookies } from "next/headers";
import { z } from "zod";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai";

import { TOKEN_COOKIE } from "@/app/api/token/route";
import { describeError, hfModel } from "@/lib/hf-router";

const bodySchema = z.object({
  // The AI SDK owns this shape; validate that it's a non-empty array and let
  // convertToModelMessages reject anything malformed inside it.
  messages: z.array(z.unknown()).min(1),
  modelId: z.string().min(1).max(200),
  // Interpolated into `${modelId}:${provider}` — never pass through unchecked.
  provider: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  reasoning: z.boolean().optional(),
});

export async function POST(req: Request) {
  // Forge holds no provider key: the caller brings their own, so a public
  // deploy can't be used as a proxy to someone else's credits.
  const apiKey = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!apiKey) {
    return Response.json(
      { error: "Add your Hugging Face token to start chatting." },
      { status: 401 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const { messages, modelId, provider, reasoning } = parsed.data;

  // Any HF hub id may arrive (users add models via search); the router is the
  // source of truth and rejects unknown or non-chat models.
  const result = streamText({
    model: hfModel({ apiKey, modelId, provider, reasoning }),
    messages: await convertToModelMessages(messages as UIMessage[]),
    // Providers cold-start long-tail models; brief failures should self-heal.
    maxRetries: 3,
    // Stop means stop: without the signal the upstream generation runs to
    // completion on the caller's own token, billed for a reply nobody sees.
    abortSignal: req.signal,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      sendReasoning: true,
      onError: describeError,
    }),
  });
}
