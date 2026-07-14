import { createHuggingFace } from "@ai-sdk/huggingface";
import {
  APICallError,
  extractReasoningMiddleware,
  wrapLanguageModel,
  type LanguageModel,
} from "ai";

import { THINK_TAG } from "@/lib/reasoning";

/**
 * Everything Forge knows about the Hugging Face router, in one place. All of
 * it was discovered empirically, and none of it is obvious from the SDK:
 *
 *  - The Responses API reports failures — depleted credits, a cold-starting
 *    provider, a non-chat model — inside a **successful HTTP 200**: a top-level
 *    `error` object when buffered, a `response.failed` event when streaming.
 *    The provider handles neither, so a failed reply just ends empty and
 *    silent. This module turns both back into real HTTP errors.
 *  - The real status is buried in the message text (`402 "…"`). Recovering it
 *    keeps permanent failures (no credits) from being retried, while transient
 *    ones (cold starts) still are.
 *  - Long-tail models fail the router's automatic provider selection; pinning
 *    `model:provider` resolves them.
 *  - Some providers stream chain-of-thought terminated by `</think>` with no
 *    opening tag — hence `startWithReasoning` for models known to reason.
 */

type FetchFn = typeof globalThis.fetch;

interface HfModelOptions {
  /** The caller's own HF token — Forge holds no key of its own. */
  apiKey: string;
  modelId: string;
  /** Pinned inference provider, for models the router can't resolve alone. */
  provider?: string;
  /** Model is known to emit chain-of-thought before its answer. */
  reasoning?: boolean;
  /** Injectable for tests: replay a recorded response without a network. */
  fetch?: FetchFn;
}

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

/** Turns a failure hidden inside an HTTP 200 back into a real HTTP error. */
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

  // Streaming: the failure arrives as a `response.failed` event the provider
  // drops on the floor — and always before any content. Peek until the stream
  // either starts producing output (replay it and stream on) or fails (turn it
  // into an error the SDK can raise).
  //
  // Erroring the stream mid-flight does NOT work: it aborts the HTTP response
  // before an error chunk can be written, and the turn ends silently again.
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

/** A router-backed model, ready to hand to streamText. */
export function hfModel({
  apiKey,
  modelId,
  provider,
  reasoning,
  fetch: fetchFn = globalThis.fetch,
}: HfModelOptions): LanguageModel {
  const huggingFace = createHuggingFace({
    apiKey,
    fetch: async (input, init) =>
      surfaceHiddenFailures(await fetchFn(input, init)),
  });

  return wrapLanguageModel({
    model: huggingFace(provider ? `${modelId}:${provider}` : modelId),
    middleware: extractReasoningMiddleware({
      tagName: THINK_TAG,
      startWithReasoning: reasoning === true,
    }),
  });
}

/**
 * The SDK masks HTTP failures behind generic text ("The request was rejected
 * as invalid") — dig out what the router actually said.
 */
export function describeError(error: unknown): string {
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
