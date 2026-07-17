import { extractReasoningMiddleware, type UIMessage } from "ai";

/**
 * The `<think>` grammar — the one owner of what Forge knows about how models
 * emit chain-of-thought. Both halves of the pipeline live here: reasoningMiddleware
 * is what every chat path wraps its model in, and splitLeakedReasoning catches
 * what got through for models the server didn't know reason.
 *
 * The awkward case is real: some providers (featherless) stream reasoning with
 * only a *closing* `</think>` and no opening tag, which the server-side
 * extraction can't catch. Three shapes must all work:
 *
 *   closing-only   "thinking…</think>the answer"   → split
 *   well-formed    "<think>thinking…</think>ans"   → split
 *   none           "just an answer"                → no reasoning
 */
const THINK_TAG = "think";

/**
 * The extraction middleware every chat path wraps its model in — the HF router,
 * a BYO provider, and a local Ollama endpoint all delimit reasoning the same
 * way, so they all configure it the same way.
 *
 * `reasoning` means the model is KNOWN to emit chain-of-thought (learned from a
 * previous reply — see markReasoning). Those providers can open the stream
 * already inside a thought with no `<think>` to announce it, so extraction has
 * to assume it starts there rather than wait for a tag that never comes.
 */
export function reasoningMiddleware(reasoning: boolean) {
  return extractReasoningMiddleware({
    tagName: THINK_TAG,
    startWithReasoning: reasoning,
  });
}

/**
 * Strips chain-of-thought out of a transcript on its way BACK to a model.
 *
 * Reasoning is for the reader, not the model — nothing is gained by replaying a
 * model's own prior thinking at it, and OpenAI-compatible providers reject it
 * outright: Groq answers 400 `property 'reasoning_content' is unsupported` for
 * an assistant turn that carries any. One reasoning reply would otherwise poison
 * every request after it, since the whole transcript is resent each turn.
 *
 * BrowserTransport never needed this — toChatTurns keeps only text parts, so it
 * drops reasoning as a side effect of how it flattens.
 */
export function withoutReasoning(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) =>
    message.role === "assistant"
      ? {
          ...message,
          parts: message.parts.filter((part) => part.type !== "reasoning"),
        }
      : message
  );
}

const CLOSING_TAG = `</${THINK_TAG}>`;
const OPENING_TAG = new RegExp(`^\\s*<${THINK_TAG}>\\s*`);

export interface ReasoningSplit {
  content: string;
  reasoning?: string;
}

/**
 * Every settled message is re-derived on every streamed token, so without a
 * cache this scan runs across the whole transcript per token. Keyed by the
 * exact text: settled messages hit the cache, and only the growing one is
 * actually scanned.
 */
const cache = new Map<string, ReasoningSplit>();
const CACHE_MAX = 200;

/** Separates leaked chain-of-thought from the answer that follows it. */
export function splitLeakedReasoning(text: string): ReasoningSplit {
  const cached = cache.get(text);
  if (cached) return cached;

  const idx = text.lastIndexOf(CLOSING_TAG);
  const split: ReasoningSplit =
    idx === -1
      ? { content: text }
      : {
          reasoning: text.slice(0, idx).replace(OPENING_TAG, "").trim(),
          content: text.slice(idx + CLOSING_TAG.length).trimStart(),
        };

  if (cache.size >= CACHE_MAX) {
    // Oldest entry: the partial texts of a finished stream are dead weight.
    cache.delete(cache.keys().next().value!);
  }
  cache.set(text, split);
  return split;
}
