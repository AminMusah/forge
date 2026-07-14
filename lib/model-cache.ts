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

/** The one the spike verified as coherent; q4f16 degenerates on some GPUs. */
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
  // A vision-language model is FOUR graphs. The vision tower and the embedding
  // table stay fp16 — quantizing them is what makes a VLM describe the wrong
  // picture, while the language halves quantize fine. Same dtype split the
  // worker loads with; keep the two in step.
  if (task === "image-text-to-text") {
    return [
      "onnx/embed_tokens_fp16.onnx",
      "onnx/vision_encoder_fp16.onnx",
      `onnx/encoder_model_${dtype}.onnx`,
      `onnx/decoder_model_merged_${dtype}.onnx`,
    ];
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

async function sizeOf(response: Response): Promise<number> {
  const header = response.headers.get("content-length");
  if (header) return Number(header);
  try {
    return (await response.clone().blob()).size;
  } catch {
    return 0;
  }
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

/** The download size of a model we haven't fetched yet — every graph it needs. */
export async function remoteSize(
  modelId: string,
  dtype: Dtype = DEFAULT_DTYPE,
  task: HfTask = "text-generation"
): Promise<number> {
  try {
    const sizes = await Promise.all(
      weightUrls(modelId, task, dtype).map(async (url) => {
        const response = await fetch(url, { method: "HEAD" });
        return Number(response.headers.get("content-length") ?? 0);
      })
    );
    return sizes.reduce((total, size) => total + size, 0);
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
