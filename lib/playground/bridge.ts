import { decodeToMono16k } from "@/lib/audio";
import { transcribeSamples } from "@/lib/browser-transport";
import type { HfTask } from "@/lib/hf-tasks";
import type { Dtype } from "@/lib/model-cache";
import { request } from "@/lib/worker-client";
import type { RunInput } from "@/lib/browser-model.worker";

/**
 * The bridge between a generated playground (running in a sandboxed iframe) and
 * the model (running in Forge's one warm worker).
 *
 * The whole reason this exists: the generated UI must reach the model WITHOUT
 * re-downloading it or spinning a second WebGPU context. So the iframe never
 * touches the model — it `postMessage`s `forge.run(input)` to the parent, the
 * parent proxies to the warm worker, and the result comes back. A happy
 * consequence: the iframe does no GPU work, so it needs no cross-origin
 * isolation (COOP/COEP) — those only matter for WebGPU/SharedArrayBuffer, which
 * live in the parent's worker, not here.
 */

export interface PlaygroundModel {
  task: HfTask;
  modelId: string;
  dtype: Dtype;
}

/**
 * Parent-side: run the model in the warm worker, resolve with its native output.
 *
 * Most tasks go through the generic `run()`. ASR is the one branch: audio needs a
 * main-thread decode (AudioContext isn't in the worker) and the tuned transcribe
 * path — so the bridge decodes here and posts a `transcribe` request, resolving
 * with `{ text }` to match the descriptor.
 */
export function runModel(
  model: PlaygroundModel,
  input: RunInput,
  onProgress?: (text: string) => void
): Promise<unknown> {
  if (model.task === "automatic-speech-recognition") {
    return transcribeViaWorker(model, input, onProgress);
  }
  return runViaWorker(model, input, onProgress);
}

async function runViaWorker(
  model: PlaygroundModel,
  input: RunInput,
  onProgress?: (text: string) => void
): Promise<unknown> {
  // Audio can't be decoded in the worker (no AudioContext), so do it here and
  // pass samples — for any audio pipeline task that isn't ASR (which took the
  // transcribe branch above).
  if (input.audio) {
    onProgress?.("Reading audio…");
    input = {
      ...input,
      audioSamples: await decodeToMono16k(input.audio),
      audio: undefined,
    };
  }

  const { data } = await request(
    {
      type: "run",
      task: model.task,
      modelId: model.modelId,
      dtype: model.dtype,
      input,
    },
    { onProgress }
  );
  return data;
}

/**
 * ASR reuses the dictation path — same worker request, same accumulation. Only
 * the shape differs: a playground descriptor expects `{ text }`, dictation wants
 * the bare string.
 */
async function transcribeViaWorker(
  model: PlaygroundModel,
  input: RunInput,
  onProgress?: (text: string) => void
): Promise<{ text: string }> {
  if (!input.audio) throw new Error("No audio provided.");
  onProgress?.("Reading audio…");
  const audio = await decodeToMono16k(input.audio);

  return {
    text: await transcribeSamples(audio, model.modelId, model.dtype, onProgress),
  };
}

/** Message envelope on the iframe↔parent channel. `__forge` namespaces it. */
interface ForgeMessage {
  __forge: true;
  kind: "run" | "result" | "error" | "progress";
  callId: string;
  input?: RunInput;
  data?: unknown;
  message?: string;
  text?: string;
}

function isForgeMessage(value: unknown): value is ForgeMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __forge?: unknown }).__forge === true
  );
}

/**
 * Parent-side: proxy `forge.run()` calls from ONE playground iframe to the warm
 * worker. Returns a teardown to detach when the playground unmounts.
 *
 * The iframe is sandboxed to an opaque origin, so it's identified by its window
 * (`event.source`), not its origin (which is "null"), and replies go back with a
 * "*" target — the only option for an opaque-origin frame.
 */
export function installPlaygroundBridge(
  iframe: HTMLIFrameElement,
  model: PlaygroundModel
): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    if (!isForgeMessage(event.data) || event.data.kind !== "run") return;

    const { callId, input } = event.data;
    const reply = (payload: Partial<ForgeMessage>) =>
      iframe.contentWindow?.postMessage(
        { __forge: true, callId, ...payload },
        "*"
      );

    runModel(model, input ?? {}, (text) => reply({ kind: "progress", text }))
      .then((data) => reply({ kind: "result", data }))
      .catch((error: unknown) =>
        reply({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      );
  };

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

/**
 * The iframe-side SDK, injected into the generated page as a `<script>`. It's the
 * `forge` object the generated code calls. Kept as a source string because it
 * runs in the iframe's context, not ours — the agent writes UI against
 * `forge.run(input)` and never sees this plumbing.
 */
export const FORGE_SDK_SOURCE = /* js */ `
(() => {
  const pending = new Map();
  // A sandboxed opaque-origin iframe doesn't always expose crypto.randomUUID.
  const uid = () =>
    (self.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  window.addEventListener("message", (event) => {
    const m = event.data;
    if (!m || m.__forge !== true || !pending.has(m.callId)) return;
    const { resolve, reject, onProgress } = pending.get(m.callId);
    if (m.kind === "progress") { onProgress && onProgress(m.text); return; }
    pending.delete(m.callId);
    if (m.kind === "result") resolve(m.data);
    else if (m.kind === "error") reject(new Error(m.message));
  });

  window.forge = {
    /** Run the pinned model on an input; resolves with the task's native output. */
    run(input, onProgress) {
      const callId = uid();
      return new Promise((resolve, reject) => {
        pending.set(callId, { resolve, reject, onProgress });
        parent.postMessage({ __forge: true, kind: "run", callId, input }, "*");
      });
    },
  };
})();
`;
