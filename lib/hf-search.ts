import { hfTasks, type HfTask } from "@/lib/hf-tasks";
import type { Model } from "@/lib/types";

interface HubModelResult {
  id: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string;
  tags?: string[];
  inferenceProviderMapping?: Array<{ provider: string; status: string }>;
}

export type HubSort = "trendingScore" | "downloads" | "likes" | "createdAt";

export interface HubSearchOptions {
  query?: string;
  /** Maps to pipeline_tag. */
  task?: HfTask;
  sort?: HubSort;
  /** Restrict to models runnable via Inference Providers. */
  runnableOnly?: boolean;
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
    limit = 20,
  } = options;

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
    "inferenceProviderMapping",
  ]) {
    params.append("expand[]", field);
  }
  if (query.trim()) params.set("search", query.trim());
  if (runnableOnly) params.set("inference_provider", "all");
  // Base (non-chat) models also carry pipeline_tag=text-generation, but the
  // router's chat API refuses them ("not a chat model") — require the
  // conversational tag for the chat task.
  if (task === "text-generation") params.set("filter", "conversational");

  const res = await fetch(`https://huggingface.co/api/models?${params}`, {
    signal,
  });
  if (!res.ok) throw new Error(`Hugging Face search failed (${res.status})`);
  const results = (await res.json()) as HubModelResult[];

  return results.map((m) => {
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
      // Pin single-provider models; multi-provider models keep auto-routing.
      provider: liveProviders.length === 1 ? liveProviders[0] : undefined,
      // Hub tags under-report reasoning models, so this only seeds the flag;
      // the store learns the rest from the first </think> it sees.
      reasoning: (m.tags ?? []).includes("reasoning") || undefined,
    };
  });
}
