"use client";

import * as React from "react";
import { toast } from "sonner";
import { Trash5 } from "reicon-react";

import { Button } from "@/components/ui/button";
import { useChatProviderStore } from "@/hooks/use-chat-provider-store";
import { useCodegenProviderStore } from "@/hooks/use-codegen-provider-store";
import { useModal } from "@/hooks/use-modal-store";
import { useModelStore } from "@/hooks/use-model-store";
import {
  enumerateCachedModels,
  formatBytes,
  removeCachedModel,
} from "@/lib/model-cache";
import { releaseModel } from "@/lib/worker-client";
import { isLocalBaseURL } from "@/lib/connection";
import { listOllamaModels, removeOllamaModel } from "@/lib/ollama-storage";
import { useOpenModel } from "@/hooks/use-open-model";
import { openActionLabel } from "@/lib/task-support";
import type { Model } from "@/lib/types";

/** A row in the storage list — a model on disk we can measure and free. */
interface Entry {
  id: string;
  label: string;
  sub?: string;
  bytes: number;
  /**
   * The catalog entry, when we have one — it carries the task, which is what
   * decides whether opening it means chat or a playground. Absent for Ollama
   * models (managed through the Providers connection, not the catalog) and for
   * anything cached before it was ever added to the store.
   */
  model?: Model;
}

/**
 * What's actually on disk — the counterpart of the search page. Cache-driven
 * (browser/WebGPU weights) plus, when a local Ollama connection is configured,
 * its models via the native API. Both freeable, behind the confirm dialog.
 */
export default function DownloadedPage() {
  const { onOpen } = useModal();
  const openModel = useOpenModel();
  const models = useModelStore((s) => s.models);
  const chatBase = useChatProviderStore((s) => s.baseURL);
  const codegenBase = useCodegenProviderStore((s) => s.baseURL);
  const refreshChat = useChatProviderStore((s) => s.refresh);
  const refreshCodegen = useCodegenProviderStore((s) => s.refresh);

  const [browser, setBrowser] = React.useState<Entry[] | null>(null);
  const [ollama, setOllama] = React.useState<Entry[] | null>(null);

  // The Ollama endpoint rides whichever configured connection is local.
  const localBase = React.useMemo(
    () => [chatBase, codegenBase].find((b) => b && isLocalBaseURL(b)) ?? null,
    [chatBase, codegenBase]
  );

  // The connection cookies are httpOnly, so ask the server what's set.
  React.useEffect(() => {
    void refreshChat();
    void refreshCodegen();
  }, [refreshChat, refreshCodegen]);

  const refreshBrowser = React.useCallback(async () => {
    const cached = await enumerateCachedModels();
    setBrowser(
      cached.map(({ modelId, bytes }) => {
        const known = models.find((m) => m.id === modelId);
        return {
          id: modelId,
          label: known?.name ?? modelId,
          sub: modelId,
          bytes,
          model: known,
        };
      })
    );
  }, [models]);

  const refreshOllama = React.useCallback(async () => {
    if (!localBase) {
      setOllama(null);
      return;
    }
    const list = await listOllamaModels(localBase);
    setOllama(list.map(({ name, bytes }) => ({ id: name, label: name, bytes })));
  }, [localBase]);

  React.useEffect(() => {
    void refreshBrowser();
  }, [refreshBrowser]);
  React.useEffect(() => {
    void refreshOllama();
  }, [refreshOllama]);

  const total = [...(browser ?? []), ...(ollama ?? [])].reduce(
    (sum, e) => sum + e.bytes,
    0
  );

  const freeBrowser = (e: Entry) =>
    onOpen("removeModel", {
      name: e.label,
      size: formatBytes(e.bytes),
      location: "this browser",
      onConfirm: async () => {
        await removeCachedModel(e.id);
        // The disk copy is gone; drop the GPU copy too, or "removed" is only
        // half true and the VRAM stays occupied for the life of the tab.
        await releaseModel(e.id);
        toast.success(`${e.label} removed`);
        await refreshBrowser();
      },
    });

  const freeOllama = (e: Entry) =>
    onOpen("removeModel", {
      title: `Remove "${e.label}" from Ollama?`,
      // Spell out that this is a real deletion from Ollama, not just Forge — the
      // weights are the user's own pull and expensive to get back.
      description: `This removes "${e.label}" from Ollama entirely — the same as running 'ollama rm ${e.id}', not just from Forge — freeing ${formatBytes(
        e.bytes
      )}. You'd need to 'ollama pull ${e.id}' (~${formatBytes(
        e.bytes
      )}) to use it again.`,
      onConfirm: async () => {
        try {
          await removeOllamaModel(localBase!, e.id);
          toast.success(`${e.label} removed`);
          await refreshOllama();
        } catch (err) {
          toast.error("Couldn't remove", {
            description: err instanceof Error ? err.message : undefined,
          });
        }
      },
    });

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-lg font-semibold">Downloaded</h1>
        <p className="text-sm text-muted-foreground">
          Models on your machine{total > 0 ? ` · ${formatBytes(total)} total` : ""}.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-4">
        <Section
          title="Browser · WebGPU"
          entries={browser}
          empty="No models downloaded to this browser yet."
          onFree={freeBrowser}
          onUse={openModel}
        />

        {localBase ? (
          <Section
            title="Ollama"
            entries={ollama}
            empty="No models installed in Ollama."
            onFree={freeOllama}
          />
        ) : (
          <div>
            <h2 className="mb-2 text-sm font-medium">Ollama</h2>
            <p className="text-sm text-muted-foreground">
              Configure a local (Ollama) provider in Providers to see and manage
              its models here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  entries,
  empty,
  onFree,
  onUse,
}: {
  title: string;
  entries: Entry[] | null;
  empty: string;
  onFree: (entry: Entry) => void;
  /** Omitted for sections whose rows aren't openable (Ollama). */
  onUse?: (model: Model) => void;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {entries === null ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
            >
              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{entry.label}</span>
                {entry.sub && entry.sub !== entry.label && (
                  <span className="truncate text-xs text-muted-foreground">
                    {entry.sub}
                  </span>
                )}
              </div>
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {formatBytes(entry.bytes)}
              </span>
              {/* Already downloaded, so opening it is the cheap, obvious next
                  step — this page listed what you have without offering any way
                  to use it. */}
              {onUse && entry.model && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUse(entry.model!)}
                >
                  {openActionLabel(entry.model.task)}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Free ${entry.label}`}
                onClick={() => onFree(entry)}
              >
                <Trash5 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
