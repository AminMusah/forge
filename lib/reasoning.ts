/**
 * The `<think>` grammar — the one owner of what Forge knows about how models
 * emit chain-of-thought. Both halves of the pipeline import it: the chat route
 * configures its extraction middleware with THINK_TAG, and the Conversation
 * module uses splitLeakedReasoning for models the server didn't know reason.
 *
 * The awkward case is real: some providers (featherless) stream reasoning with
 * only a *closing* `</think>` and no opening tag, which the server-side
 * extraction can't catch. Three shapes must all work:
 *
 *   closing-only   "thinking…</think>the answer"   → split
 *   well-formed    "<think>thinking…</think>ans"   → split
 *   none           "just an answer"                → no reasoning
 */
export const THINK_TAG = "think";

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
