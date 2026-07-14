"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Search } from "reicon-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrowserModelRow } from "@/components/models/browser-model-row";
import { isRunnable, unrunnableReason } from "@/components/chat/task-surface";
import { useModelStore } from "@/hooks/use-model-store";
import { formatBytes, totalCachedSize } from "@/lib/model-cache";
import { cn } from "@/lib/utils";
import {
  searchHubModels,
  type HubSort,
  type Runtime,
} from "@/lib/hf-search";
import { hfTasks, taskLabel, type HfTask } from "@/lib/hf-tasks";
import type { Model } from "@/lib/types";

const sortLabels: Record<HubSort, string> = {
  trendingScore: "Trending",
  downloads: "Most downloads",
  likes: "Most likes",
  createdAt: "Newest",
};

export default function ModelsPage() {
  const router = useRouter();
  const addModel = useModelStore((state) => state.addModel);
  const setModel = useModelStore((state) => state.setModel);

  const [query, setQuery] = React.useState("");
  const [task, setTask] = React.useState<HfTask>("text-generation");
  const [sort, setSort] = React.useState<HubSort>("trendingScore");
  const [runtime, setRuntime] = React.useState<Runtime>("server");
  const [results, setResults] = React.useState<Model[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [cacheUsed, setCacheUsed] = React.useState(0);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Measured from transformers.js's own cache bucket, so it reports local
  // models specifically — not everything the origin has stored.
  const refreshCacheUsage = React.useCallback(() => {
    void totalCachedSize().then(setCacheUsed);
  }, []);

  React.useEffect(refreshCacheUsage, [refreshCacheUsage, results]);

  // ⌘K / Ctrl+K focuses search (⌘B is taken by the sidebar toggle).
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // Server models must be provider-backed (otherwise they can't answer at
      // all); browser models must have ONNX weights.
      searchHubModels(
        { query, task, sort, runtime, runnableOnly: true },
        controller.signal
      )
        .then((found) => {
          setResults(found);
          setLoading(false);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setLoading(false);
          toast.error("Model search failed", {
            description: error instanceof Error ? error.message : undefined,
          });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, task, sort, runtime]);

  const useInChat = (model: Model) => {
    addModel(model);
    setModel(model);
    router.push("/");
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-col gap-4 px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Models</h1>
          <p className="text-sm text-muted-foreground">
            {runtime === "browser"
              ? "Models that run on your GPU — no token, no credits."
              : "Browse Hugging Face models and pick one to chat with."}
          </p>
        </div>
        {cacheUsed > 0 && (
          <p className="shrink-0 text-xs text-muted-foreground">
            Local models using {formatBytes(cacheUsed)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-9 min-w-60 flex-1 items-center gap-2 rounded-[10px] border px-3 text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <Search className="size-3.5 shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                className="h-9 gap-1.5 rounded-[10px] px-3 text-sm font-normal"
              />
            }
          >
            {runtime === "browser" ? "Browser" : "Server"}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            <DropdownMenuRadioGroup
              value={runtime}
              onValueChange={(value) => setRuntime(value as Runtime)}
            >
              <DropdownMenuRadioItem value="server">
                Server
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="browser">
                Browser
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                className="h-9 gap-1.5 rounded-[10px] px-3 text-sm font-normal"
              />
            }
          >
            {taskLabel(task)}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 w-64 overflow-y-auto">
            <DropdownMenuRadioGroup
              value={task}
              onValueChange={(value) => setTask(value as HfTask)}
            >
              {hfTasks.map((t) => (
                <DropdownMenuRadioItem key={t} value={t}>
                  {taskLabel(t)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                className="h-9 gap-1.5 rounded-[10px] px-3 text-sm font-normal"
              />
            }
          >
            {sortLabels[sort]}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => setSort(value as HubSort)}
            >
              {(Object.keys(sortLabels) as HubSort[]).map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {sortLabels[s]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Only show the searching state on a cold list — otherwise the results
            stay put and dim, so the list never flashes empty mid-typing. */}
        {loading && results.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Searching Hugging Face…
          </p>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No models found. Try a different search or filters.
          </p>
        ) : (
          <ul
            className={cn(
              "flex flex-col gap-2 pb-4 transition-opacity duration-150 ease-out",
              loading && "opacity-50"
            )}
          >
            {results.map((model) =>
              model.runtime === "browser" ? (
                // Downloading is deliberate — see BrowserModelRow.
                <BrowserModelRow
                  key={model.id}
                  model={model}
                  onUse={useInChat}
                />
              ) : (
              <li
                key={model.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors duration-150 hover:bg-muted/40"
              >
                <div className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">
                    {model.id}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {model.description}
                  </span>
                </div>
                <span className="hidden shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground sm:inline">
                  {taskLabel(model.task)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isRunnable(model)}
                  title={unrunnableReason(model)}
                  onClick={() => useInChat(model)}
                >
                  {model.task === "automatic-speech-recognition"
                    ? "Transcribe"
                    : "Use in chat"}
                </Button>
              </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
