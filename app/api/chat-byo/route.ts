import { cookies } from "next/headers";
import { z } from "zod";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  wrapLanguageModel,
  type UIMessage,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { describeError } from "@/lib/hf-router";
import { reasoningMiddleware } from "@/lib/reasoning";
import {
  CHAT_COOKIE,
  parseConnection,
} from "@/lib/playground/codegen-connection";

/**
 * Chat against the user's BYO OpenAI-compatible connection (local Ollama, or a
 * proprietary baseline). A PEER to /api/chat — kept separate on purpose so the
 * HF Responses-API path (lib/hf-router, with its hard-won hidden-failure
 * recovery) stays completely untouched. The connection defines the model; the
 * client only sends the transcript.
 */

const bodySchema = z.object({
  messages: z.array(z.unknown()).min(1),
  /** Model is known to emit chain-of-thought before its answer. */
  reasoning: z.boolean().optional(),
});

export async function POST(req: Request) {
  const conn = parseConnection((await cookies()).get(CHAT_COOKIE)?.value);
  if (!conn) {
    return Response.json(
      { error: "Add a chat provider to chat with your own model." },
      { status: 401 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const { messages, reasoning } = parsed.data;

  // Some OpenAI-compatible providers stream chain-of-thought inline, closed by
  // </think> with no opening tag. (Providers that use a native reasoning_content
  // delta are surfaced by the SDK provider directly.)
  const model = wrapLanguageModel({
    model: createOpenAICompatible({
      name: "byo-chat",
      baseURL: conn.baseURL,
      apiKey: conn.apiKey,
    })(conn.modelId),
    middleware: reasoningMiddleware(reasoning === true),
  });

  const result = streamText({
    model,
    messages: await convertToModelMessages(messages as UIMessage[]),
    maxRetries: 2,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      sendReasoning: true,
      onError: describeError,
    }),
  });
}
