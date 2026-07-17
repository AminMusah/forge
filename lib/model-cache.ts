import type { HfTask } from "@/lib/hf-tasks";

/**
 * Browser-model weights live in transformers.js's own Cache Storage bucket
 * (`env.cacheKey`), so we can measure and evict them precisely — no guessing
 * from navigator.storage.estimate(), which reports the whole origin.
 *
 * Cached entries are keyed by their Hub URL, e.g.
 *   https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/onnx/model_q4.onnx
 */
const CACHE_NAME = "transformers-cache";

export type Dtype = "q4" | "q4f16" | "fp16" | "int8";

/** Verified coherent across GPUs; q4f16 degenerates into loops on some of them. */
export const DEFAULT_DTYPE: Dtype = "q4";

/**
 * The weight files a task's pipeline actually downloads. Not one file per model:
 * an encoder-decoder like Whisper ships two graphs, and a text generator one — so
 * looking for `model_q4.onnx` on Whisper finds nothing and reports a downloaded
 * model as missing.
 *
 * The encoder is unquantized on purpose; see the dtype split in the worker.
 */
export function weightFiles(task: HfTask, dtype: Dtype): string[] {
  if (task === "automatic-speech-recognition") {
    return ["onnx/encoder_model.onnx", `onnx/decoder_model_merged_${dtype}.onnx`];
  }
  return [`onnx/model_${dtype}.onnx`];
}

function weightUrls(modelId: string, task: HfTask, dtype: Dtype): string[] {
  return weightFiles(task, dtype).map(
    (file) => `https://huggingface.co/${modelId}/resolve/main/${file}`
  );
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/**
 * Cached weight responses always carry content-length from the Hub. If one
 * somehow doesn't, report 0 (which formatBytes renders as "—") rather than
 * measuring it: the fallback was `(await response.clone().blob()).size`, which
 * pulls hundreds of megabytes into memory to count them.
 */
async function sizeOf(response: Response): Promise<number> {
  const header = response.headers.get("content-length");
  return header ? Number(header) : 0;
}

/**
 * Bytes of this model's weights already on disk, or 0 if not downloaded. A model
 * whose graphs are only partly cached counts as not downloaded — it would still
 * have to hit the network to run.
 */
export async function cachedSize(
  modelId: string,
  dtype: Dtype = DEFAULT_DTYPE,
  task: HfTask = "text-generation"
): Promise<number> {
  const cache = await openCache();
  if (!cache) return 0;

  const hits = await Promise.all(
    weightUrls(modelId, task, dtype).map((url) => cache.match(url))
  );
  if (hits.some((hit) => !hit)) return 0;

  const sizes = await Promise.all(hits.map((hit) => sizeOf(hit!)));
  return sizes.reduce((total, size) => total + size, 0);
}

/**
 * Every model with weights in the cache, and its total bytes — enumerated from
 * the cache itself (URLs → modelId), not from the catalog. So it surfaces what's
 * ACTUALLY on disk, including models no longer in any list the user would search
 * (orphans), which is the whole point of a storage view. Largest first.
 */
export async function enumerateCachedModels(): Promise<
  { modelId: string; bytes: number }[]
> {
  const cache = await openCache();
  if (!cache) return [];

  const requests = await cache.keys();
  const byModel = new Map<string, number>();
  await Promise.all(
    requests.map(async (request) => {
      // https://huggingface.co/<org>/<name>/resolve/main/onnx/model_q4.onnx
      const match = /huggingface\.co\/(.+?)\/resolve\//.exec(request.url);
      if (!match) return;
      const hit = await cache.match(request);
      const bytes = hit ? await sizeOf(hit) : 0;
      byModel.set(match[1], (byModel.get(match[1]) ?? 0) + bytes);
    })
  );

  return Array.from(byModel, ([modelId, bytes]) => ({ modelId, bytes })).sort(
    (a, b) => b.bytes - a.bytes
  );
}

/** Total bytes across every locally cached model — not the whole origin. */
export async function totalCachedSize(): Promise<number> {
  const cache = await openCache();
  if (!cache) return 0;

  // matchAll() hands back the responses directly; keys() + a match() per key
  // walked the whole cache twice for the same answer. (enumerateCachedModels
  // keeps keys() — it needs request.url to derive the model id.)
  const responses = await cache.matchAll();
  const sizes = await Promise.all(responses.map(sizeOf));
  return sizes.reduce((total, size) => total + size, 0);
}

/** Evicts every cached file belonging to a model, reclaiming the space. */
export async function removeCachedModel(modelId: string): Promise<void> {
  const cache = await openCache();
  if (!cache) return;

  const requests = await cache.keys();
  await Promise.all(
    requests
      .filter((request) => request.url.includes(`/${modelId}/`))
      .map((request) => cache.delete(request))
  );
}

/** The download size of a model we haven't fetched yet — every graph it needs. */
export async function remoteSize(
  modelId: string,
  dtype: Dtype = DEFAULT_DTYPE,
  task: HfTask = "text-generation",
  signal?: AbortSignal
): Promise<number> {
  try {
    const sizes = await Promise.all(
      weightUrls(modelId, task, dtype).map(async (url) => {
        const response = await fetch(url, { method: "HEAD", signal });
        return Number(response.headers.get("content-length") ?? 0);
      })
    );
    return sizes.reduce((total, size) => total + size, 0);
  } catch {
    // Includes abort: a row that's gone doesn't need a size.
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.round(mb)}MB`;
}

/** Browser models need WebGPU; without it they can't run at all. */
export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
