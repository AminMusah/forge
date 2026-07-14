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

/** The one the spike verified as coherent; q4f16 degenerates on some GPUs. */
export const DEFAULT_DTYPE: Dtype = "q4";

export function weightsUrl(modelId: string, dtype: Dtype): string {
  const file = dtype === "fp16" ? "model_fp16.onnx" : `model_${dtype}.onnx`;
  return `https://huggingface.co/${modelId}/resolve/main/onnx/${file}`;
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function sizeOf(response: Response): Promise<number> {
  const header = response.headers.get("content-length");
  if (header) return Number(header);
  try {
    return (await response.clone().blob()).size;
  } catch {
    return 0;
  }
}

/** Bytes of this model's weights already on disk, or 0 if not downloaded. */
export async function cachedSize(
  modelId: string,
  dtype: Dtype = DEFAULT_DTYPE
): Promise<number> {
  const cache = await openCache();
  if (!cache) return 0;
  const hit = await cache.match(weightsUrl(modelId, dtype));
  return hit ? sizeOf(hit) : 0;
}

/** Total bytes across every locally cached model — not the whole origin. */
export async function totalCachedSize(): Promise<number> {
  const cache = await openCache();
  if (!cache) return 0;

  const requests = await cache.keys();
  const sizes = await Promise.all(
    requests.map(async (request) => {
      const hit = await cache.match(request);
      return hit ? sizeOf(hit) : 0;
    })
  );
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

/** The download size of a model we haven't fetched yet. */
export async function remoteSize(
  modelId: string,
  dtype: Dtype = DEFAULT_DTYPE
): Promise<number> {
  try {
    const response = await fetch(weightsUrl(modelId, dtype), {
      method: "HEAD",
    });
    return Number(response.headers.get("content-length") ?? 0);
  } catch {
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
