import { hfTasks, type HfTask } from "@/lib/hf-tasks";
import { DEFAULT_DTYPE, type Dtype } from "@/lib/model-cache";
import type { Model } from "@/lib/types";

interface HubModelResult {
  id: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string;
  tags?: string[];
  siblings?: Array<{ rfilename: string }>;
  inferenceProviderMapping?: Array<{ provider: string; status: string }>;
}

export type Runtime = "server" | "browser";

/**
 * Which quantizations a model actually ships, read from its ONNX files.
 *
 * Match on the dtype SUFFIX, not a fixed filename: a text generator quantizes
 * `model_q4.onnx`, but an encoder-decoder like Whisper quantizes
 * `decoder_model_merged_q4.onnx`. Looking for the former dropped every browser
 * Whisper model from search as having no runnable quantization.
 */
function availableDtypes(siblings: HubModelResult["siblings"]): Dtype[] {
  const files = (siblings ?? []).map((s) => s.rfilename);
  const found: Dtype[] = [];
  for (const dtype of ["q4", "q4f16", "fp16", "int8"] as Dtype[]) {
    if (files.some((file) => file.endsWith(`_${dtype}.onnx`))) found.push(dtype);
  }
  return found;
}

export type HubSort = "trendingScore" | "downloads" | "likes" | "createdAt";

export interface HubSearchOptions {
  query?: string;
  /** Maps to pipeline_tag. */
  task?: HfTask;
  sort?: HubSort;
  /** Restrict to models runnable via Inference Providers. */
  runnableOnly?: boolean;
  /** "browser" searches models that can run locally via transformers.js. */
  runtime?: Runtime;
  limit?: number;
}

const compact = new Intl.NumberFormat("en", { notation: "compact" });

/** Searches the Hugging Face Hub (no auth needed for search itself). */
export async function searchHubModels(
  options: HubSearchOptions = {},
  signal?: AbortSignal
): Promise<Model[]> {
  const {
    query = "",
    task = "text-generation",
    sort = "trendingScore",
    runnableOnly = true,
    runtime = "server",
    limit = 20,
  } = options;

  const isBrowser = runtime === "browser";

  const params = new URLSearchParams({
    pipeline_tag: task,
    sort,
    limit: String(limit),
  });
  for (const field of [
    "downloads",
    "likes",
    "pipeline_tag",
    "tags",
    // Available quantizations come free with the search — no extra request.
    ...(isBrowser ? ["siblings"] : ["inferenceProviderMapping"]),
  ]) {
    params.append("expand[]", field);
  }
  if (query.trim()) params.set("search", query.trim());

  if (isBrowser) {
    // Only models with ONNX weights can run locally via transformers.js.
    params.append("filter", "onnx");
    params.set("library", "transformers.js");
  } else if (runnableOnly) {
    params.set("inference_provider", "all");
  }

  // Base (non-chat) models also carry pipeline_tag=text-generation, but they
  // can't hold a conversation — the router rejects them outright, and locally
  // they just ramble. Require the conversational tag either way.
  if (task === "text-generation") params.append("filter", "conversational");

  const res = await fetch(`https://huggingface.co/api/models?${params}`, {
    signal,
  });
  if (!res.ok) throw new Error(`Hugging Face search failed (${res.status})`);
  const results = (await res.json()) as HubModelResult[];

  return results
    .map((m): Model | null => {
      const dtypes = isBrowser ? availableDtypes(m.siblings) : [];
      // A browser model with no quantization we support would download
      // gigabytes of fp32 — drop it rather than offer a trap.
      if (isBrowser && dtypes.length === 0) return null;

      const liveProviders = (m.inferenceProviderMapping ?? [])
        .filter((p) => p.status === "live")
        .map((p) => p.provider);

      return {
        id: m.id,
        name: m.id.split("/").pop() ?? m.id,
        description: `${m.id.split("/")[0]} · ${compact.format(m.downloads ?? 0)} downloads · ${compact.format(m.likes ?? 0)} likes`,
        task: (hfTasks as readonly string[]).includes(m.pipeline_tag ?? "")
          ? (m.pipeline_tag as HfTask)
          : task,
        runtime,
        // Prefer the quantization verified as coherent across GPUs.
        dtype: dtypes.includes(DEFAULT_DTYPE) ? DEFAULT_DTYPE : dtypes[0],
        dtypes: isBrowser ? dtypes : undefined,
        // Pin single-provider models; multi-provider models keep auto-routing.
        provider: liveProviders.length === 1 ? liveProviders[0] : undefined,
        // Hub tags under-report reasoning models, so this only seeds the flag;
        // the store learns the rest from the first </think> it sees.
        reasoning: (m.tags ?? []).includes("reasoning") || undefined,
      };
    })
    .filter((m): m is Model => m !== null);
}
