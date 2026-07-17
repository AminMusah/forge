import { isLocalBaseURL } from "@/lib/playground/codegen-connection";
import type { Model } from "@/lib/types";

/**
 * Which backend a chat model resolves to. Named because the answer is needed in
 * three places that must agree: conversationOf picks the transport, onFinish and
 * onError branch on whether failures look like the HF router's, and
 * useConversation keys its instance memo on it.
 *
 * A string rather than a constructed transport, deliberately — a primitive is
 * what makes it usable as a memo dependency. Two transports built from the same
 * model are never reference-equal, so an object here would rebuild the
 * conversation on every render.
 */
export type TransportKind = "browser" | "local" | "byo" | "hf-router";

/**
 * Marks a model id as belonging to the BYO connection rather than the catalog.
 *
 * Lives here rather than with the model store because selectTransport must read
 * it without importing the store — the point of this module is that it can be
 * exercised without standing up the store graph.
 */
export const BYO_CHAT_PREFIX = "byo-chat:";

/**
 * The transport decision, as a pure function of the two facts it turns on.
 *
 * `Model.runtime` and `Model.chatConnection` are NOT interchangeable and don't
 * collapse into one field: `runtime` says where the weights execute and is read
 * across the models catalog, HF search and playground routing, while
 * `chatConnection` marks the synthetic BYO model and is read nowhere but the
 * chat transport. This is the one place that combines them.
 *
 * The baseURL is passed in rather than read from the chat-provider store so this
 * stays free of store imports — the whole point of naming the decision is that
 * it can be exercised without standing up the store graph.
 */
export function selectTransport(
  // Absent when a chat's pinned model has been deleted from the catalog, or —
  // for a BYO chat — simply not resolved YET; see modelId below.
  model: Model | null | undefined,
  chatBaseURL: string | null,
  /**
   * The chat's pinned id. Load-bearing when the model can't be resolved: the
   * chat provider is fetched after mount (its key is httpOnly, so only the
   * server knows one is set), so on a fresh load a BYO chat has no model to
   * resolve against — but its ID still says it is one. Without this the first
   * message goes to the router and asks for a Hugging Face token the user never
   * chose. /api/chat-byo reads the connection from the cookie server-side, so it
   * can answer even while the client is still ignorant of it.
   */
  modelId?: string
): TransportKind {
  // A browser model runs on the user's GPU whatever else is configured.
  if (model?.runtime === "browser") return "browser";
  if (model?.chatConnection || modelId?.startsWith(BYO_CHAT_PREFIX)) {
    // A localhost provider must be called from the browser — a hosted server
    // can't reach the user's machine — so it needs its own transport rather
    // than the /api/chat-byo round trip.
    return isLocalBaseURL(chatBaseURL ?? "") ? "local" : "byo";
  }
  return "hf-router";
}

/**
 * The kind, plus everything else a transport is built from, as one primitive.
 *
 * A conversation is only reusable while its identity holds. Both halves matter
 * and neither implies the other: a provider edited from a cloud URL to a
 * localhost one changes the KIND with no rebind, and re-pinning one browser
 * model to another changes the MODEL with no kind change — BrowserTransport
 * freezes its model id at construction.
 *
 * Defined once because two callers must agree exactly on it: conversationOf
 * decides whether its cached instance still stands, and useConversation keys its
 * memo on the same string.
 */
export function transportFor(
  model: Model | null | undefined,
  chatBaseURL: string | null,
  modelId: string | undefined
): { kind: TransportKind; identity: string } {
  const kind = selectTransport(model, chatBaseURL, modelId);
  return { kind, identity: `${kind}:${modelId ?? ""}` };
}
