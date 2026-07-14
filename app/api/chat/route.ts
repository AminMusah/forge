import { createHuggingFace } from "@ai-sdk/huggingface";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  APICallError,
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  extractReasoningMiddleware,
  toUIMessageStream,
  wrapLanguageModel,
  type UIMessage,
} from "ai";

import { TOKEN_COOKIE } from "@/app/api/token/route";
import { THINK_TAG } from "@/lib/reasoning";

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

/**
 * The router buries the real status in the message text (`402 "…"`). Recover
 * both, so permanent failures (no credits, bad model) aren't retried while
 * transient ones (cold starts, overload) still are.
 */
function parseFailure(message: unknown): { status: number; message: string } {
  const text = typeof message === "string" ? message : "";
  const match = /^(\d{3})\s+"?([\s\S]*?)"?$/.exec(text.trim());
  return {
    status: match ? Number(match[1]) : 502,
    message:
      (match ? match[2] : text).trim() ||
      "The model provider rejected the request.",
  };
}

function failureResponse(message: unknown): Response {
  const failure = parseFailure(message);
  return new Response(JSON.stringify({ error: { message: failure.message } }), {
    status: failure.status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * HF's Responses API reports failures — depleted credits, a cold-starting
 * provider, a non-chat model — inside a **successful HTTP 200**: as a top-level
 * `error` object when buffered, or a `response.failed` event when streaming.
 * The provider ignores both, so the reply just ends empty and silent.
 * This intercepts them and turns them back into real errors.
 */
async function surfaceHiddenFailures(response: Response): Promise<Response> {
  if (!response.ok || !response.body) return response;

  // Buffered: HTTP 200 with an error payload.
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error) {
        return failureResponse(parsed.error.message ?? parsed.error);
      }
    } catch {
      // Not JSON after all — hand the original body back untouched.
    }
    return new Response(body, {
      status: response.status,
      headers: response.headers,
    });
  }

  // Streaming: failures arrive as a `response.failed` event the provider drops
  // on the floor — and always before any content. Peek until the stream either
  // starts producing output (replay and stream on) or fails (turn it into a
  // real HTTP error the SDK can raise).
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const seen: Uint8Array[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    seen.push(value);
    buffer += decoder.decode(value, { stream: true });

    let failure: unknown;
    let started = false;
    for (const line of buffer.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (
          event?.type === "response.failed" ||
          event?.response?.status === "failed"
        ) {
          failure = event.response?.error?.message ?? "";
        } else if (
          typeof event?.type === "string" &&
          event.type.startsWith("response.output")
        ) {
          started = true;
        }
      } catch {
        // Partial frame — it'll be complete on a later chunk.
      }
    }

    if (failure !== undefined) {
      void reader.cancel();
      return failureResponse(failure);
    }
    if (started) break;
  }

  // Replay what we peeked, then hand over the rest of the live stream.
  const replayed = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of seen) controller.enqueue(chunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });

  return new Response(replayed, {
    status: response.status,
    headers: response.headers,
  });
}

/**
 * Built per request from the caller's own token — Forge holds no key of its
 * own, so a public deploy can't be used as a proxy to someone else's credits.
 */
function huggingFaceFor(apiKey: string) {
  return createHuggingFace({
    apiKey,
    fetch: async (input, init) =>
      surfaceHiddenFailures(await fetch(input, init)),
  });
}

/** The SDK masks HTTP failures ("request was rejected as invalid") — dig out
 *  what the router actually said. */
function describeError(error: unknown): string {
  if (APICallError.isInstance(error) && error.responseBody) {
    try {
      const body = JSON.parse(error.responseBody);
      const message = body?.error?.message ?? body?.error ?? body?.message;
      if (typeof message === "string" && message) return message;
    } catch {
      // Non-JSON body (e.g. an HTML error page) — fall through.
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export async function POST(req: Request) {
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

  // Any HF hub id may arrive (users add models via search); the HF router
  // is the source of truth and rejects unknown or non-chat models.
  // A pinned provider (single-provider models) bypasses the router's
  // automatic selection, which can fail to resolve long-tail models.
  const model = huggingFaceFor(apiKey)(
    provider ? `${modelId}:${provider}` : modelId
  );

  // Known reasoning models stream chain-of-thought before the answer, often
  // terminated by </think> with no opening tag — hence startWithReasoning.
  const result = streamText({
    model: wrapLanguageModel({
      model,
      middleware: extractReasoningMiddleware({
        tagName: THINK_TAG,
        startWithReasoning: reasoning === true,
      }),
    }),
    messages: await convertToModelMessages(messages as UIMessage[]),
    // Providers cold-start long-tail models; brief failures should self-heal.
    maxRetries: 3,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      sendReasoning: true,
      onError: describeError,
    }),
  });
}
