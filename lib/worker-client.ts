import type { WorkerRequest, WorkerResponse } from "@/lib/browser-model.worker";

/**
 * Talking to the one warm worker. The worker is a single message channel shared
 * by every caller — chat, dictation, preload, and every playground run — so each
 * request has to mint an id, filter the channel down to its own replies, and
 * detach when it's done. That protocol lives here rather than at each call site.
 */

/** One worker, one warm model — see browser-model.worker.ts. */
let worker: Worker | null = null;

export function getWorker(): Worker {
  worker ??= new Worker(
    new URL("./browser-model.worker.ts", import.meta.url),
    { type: "module" }
  );
  return worker;
}

/** Distributes over the union, so each variant keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * A request minus its id — request() mints that, so no caller can post one that
 * collides. `interrupt` isn't one of these: it answers nothing, so it's
 * fire-and-forget rather than a round trip — but it carries the id of the
 * request it cancels, since the worker is shared by every caller.
 */
export type WorkerCall = DistributiveOmit<
  Exclude<WorkerRequest, { type: "interrupt" }>,
  "id"
>;

export interface WorkerCallOptions {
  /** Download/compile status — transient, never content. */
  onProgress?: (text: string) => void;
  /** Each streamed token, for a caller that renders as they arrive. Deltas are
   *  accumulated into the resolved `text` either way. */
  onToken?: (delta: string) => void;
  /** Perf signals for a browser run, once known. Which figures are meaningful
   *  depends on the task — see the worker's `stats` message. */
  onStats?: (stats: {
    loadMs: number;
    tokensPerSecond: number;
    inferenceMs: number;
  }) => void;
  /** Interrupts the worker's generation loop when aborted. */
  abortSignal?: AbortSignal;
}

/**
 * One round trip: post a request, collect what comes back under its id, settle
 * on the terminal message.
 *
 * Resolves with both shapes the worker can answer in — `text` for the streaming
 * tasks (generate, transcribe) and `data` for a pipeline run's native output.
 * A request only ever fills one; callers take the one their task speaks.
 */
export function request(
  message: WorkerCall,
  { onProgress, onToken, onStats, abortSignal }: WorkerCallOptions = {}
): Promise<{ text: string; data: unknown }> {
  const worker = getWorker();
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    // Transcribe sends its whole transcript as one delta, but accumulate rather
    // than assume — the contract is a stream of them.
    let text = "";

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;

      switch (msg.type) {
        case "progress":
          onProgress?.(msg.text);
          break;
        case "token":
          text += msg.delta;
          onToken?.(msg.delta);
          break;
        case "stats":
          onStats?.({
            loadMs: msg.loadMs,
            tokensPerSecond: msg.tokensPerSecond,
            inferenceMs: msg.inferenceMs,
          });
          break;
        case "done":
          cleanup();
          resolve({ text, data: undefined });
          break;
        case "result":
          cleanup();
          resolve({ text, data: msg.data });
          break;
        case "error":
          cleanup();
          reject(new Error(msg.message));
          break;
      }
    };

    // An interrupted generation still ends in `done`, so aborting settles this
    // promise normally rather than rejecting.
    const onAbort = () => {
      worker.postMessage({ type: "interrupt", id } satisfies WorkerRequest);
    };

    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      abortSignal?.removeEventListener("abort", onAbort);
    };

    worker.addEventListener("message", onMessage);
    abortSignal?.addEventListener("abort", onAbort);
    worker.postMessage({ ...message, id } as WorkerRequest);
    // A signal can already be aborted by the time request() is called — the
    // `abort` event fired before there was a listener, so nothing would ever
    // interrupt this job. Post the request first so the worker knows the id,
    // then cancel it.
    if (abortSignal?.aborted) onAbort();
  });
}

/**
 * Drop a model from the worker's memory. The disk cache and the GPU copy are
 * separate: removeCachedModel() frees the bytes on disk, but the compiled model
 * stays resident for the life of the tab unless someone says otherwise — so
 * "Remove model" reported success while the VRAM stayed occupied.
 */
export async function releaseModel(modelId: string): Promise<void> {
  // No worker means nothing is loaded — don't spawn one just to free nothing.
  if (!worker) return;
  await request({ type: "release", modelId });
}

/**
 * Tear the worker down entirely, freeing the GPU. For leaving the page — NOT for
 * unmounting a chat: the warm model surviving navigation is the whole point of
 * the singleton, and re-compiling costs tens of seconds.
 */
export function terminateWorker(): void {
  worker?.terminate();
  worker = null;
}

// Leaving the page should hand the GPU back rather than waiting for the tab to
// be reclaimed. pagehide (not beforeunload) also covers the bfcache path.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => terminateWorker());
}
