"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, DesktopDownload, Trash5 } from "reicon-react";

import { isRunnable, unrunnableReason } from "@/lib/task-support";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useModal } from "@/hooks/use-modal-store";
import { preloadModel } from "@/lib/browser-transport";
import {
  DEFAULT_DTYPE,
  cachedSize,
  formatBytes,
  hasWebGPU,
  removeCachedModel,
  remoteSize,
} from "@/lib/model-cache";
import type { Model } from "@/lib/types";

interface BrowserModelRowProps {
  model: Model;
  onUse: (model: Model) => void;
}

/**
 * A model that runs on the user's own GPU. Downloading is deliberate — the
 * weights are hundreds of megabytes, so it never happens as a side effect of
 * sending a message.
 */
export function BrowserModelRow({ model, onUse }: BrowserModelRowProps) {
  const { onOpen } = useModal();
  const dtype = model.dtype ?? DEFAULT_DTYPE;

  const [size, setSize] = React.useState(0);
  const [downloaded, setDownloaded] = React.useState<boolean | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const webgpu = React.useMemo(hasWebGPU, []);
  const runnable = isRunnable(model);
  // Why the row's action is unavailable — Forge can't run this task/model, or
  // this browser lacks WebGPU. Shown in the row and used to gate the button.
  const disabledReason = !runnable
    ? unrunnableReason(model)
    : webgpu
      ? undefined
      : "Requires WebGPU — try Chrome or Edge";

  // Cache Storage is the source of truth — no bookkeeping of ours to drift. The
  // task decides which files to look for: Whisper ships two graphs, not one.
  const refresh = React.useCallback(async () => {
    const cached = await cachedSize(model.id, dtype, model.task);
    setDownloaded(cached > 0);
    setSize(cached > 0 ? cached : await remoteSize(model.id, dtype, model.task));
  }, [model.id, dtype, model.task]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = async () => {
    setStatus("Starting…");
    try {
      // Runs through the shared worker, so the model is compiled and warm
      // afterwards — the first message streams immediately.
      await preloadModel(model.id, dtype, setStatus, model.task);
      toast.success(`${model.name} ready`, {
        description: "It runs on your GPU — no token, no credits.",
      });
      await refresh();
    } catch (error) {
      toast.error("Download failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setStatus(null);
    }
  };

  // Deleting hundreds of megabytes is worth a confirmation — re-downloading it
  // is a long wait, and the click sits right beside "Use in chat".
  const confirmRemove = () => {
    onOpen("removeModel", {
      model,
      size: formatBytes(size),
      onConfirm: async () => {
        await removeCachedModel(model.id);
        toast.success(`${model.name} removed`);
        await refresh();
      },
    });
  };

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors duration-150 hover:bg-muted/40">
      <div className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{model.id}</span>
        <span className="truncate text-xs text-muted-foreground">
          {model.description}
        </span>
      </div>

      <span className="hidden shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground sm:inline">
        {status ?? (size > 0 ? `${dtype} · ${formatBytes(size)}` : dtype)}
      </span>

      {/* Visible reason when a button is disabled — a `disabled` button hides its
          own title tooltip, so the reason has to be in the row. */}
      {!status && disabledReason && (
        <span className="hidden max-w-40 shrink-0 text-right text-xs text-muted-foreground md:inline">
          {disabledReason}
        </span>
      )}

      {status ? (
        <Button size="sm" variant="outline" disabled className="gap-1.5">
          <Spinner className="size-3.5" />
          Downloading
        </Button>
      ) : downloaded ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Remove downloaded model"
            onClick={confirmRemove}
          >
            <Trash5 />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!runnable}
            onClick={() => onUse(model)}
          >
            <Check className="size-3.5" />
            Use in chat
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          // Don't let someone spend a multi-hundred-MB download on a model we
          // then refuse to run.
          disabled={!webgpu || downloaded === null || !runnable}
          onClick={() => void download()}
        >
          <DesktopDownload className="size-3.5" />
          Download
        </Button>
      )}
    </li>
  );
}
