"use client";

import * as React from "react";
import { Music } from "reicon-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface AudioDropzoneProps {
  onFile: (file: File) => void;
  /** True while the previous clip is still being transcribed. */
  busy?: boolean;
  hint?: string;
  /** Composer-sized: a single row, so it can sit under a thread like ChatInput. */
  compact?: boolean;
  /** Composer controls (the model chip) — ChatInput carries these in a toolbar. */
  actions?: React.ReactNode;
}

/**
 * Drop an audio file, or click to pick one. The first file input in Forge —
 * attachments and every future image task want the same control, so it takes a
 * file and knows nothing about transcription.
 */
export function AudioDropzone({
  onFile,
  busy,
  hint,
  compact,
  actions,
}: AudioDropzoneProps) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !busy) onFile(file);
  };

  const dropHandlers = {
    onDragOver: (event: React.DragEvent) => {
      // Without this the browser navigates to the file instead of dropping it.
      event.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setOver(false);
      take(event.dataTransfer.files);
    },
  };

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept="audio/*"
      hidden
      onChange={(event) => {
        take(event.target.files);
        // Reset, or picking the same file twice fires no change event.
        event.target.value = "";
      }}
    />
  );

  // The composer form of the control: one row, sized like ChatInput, so a thread
  // reads as a thread — the clip you drop is the next message.
  if (compact) {
    return (
      <div
        {...dropHandlers}
        className={cn(
          "flex w-full items-center gap-3 rounded-[18px] border border-dashed bg-card p-3 transition-colors duration-150 ease-out",
          over && "border-ring bg-muted/50",
          busy && "opacity-60"
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          {busy ? <Spinner /> : <Music />}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {busy ? "Transcribing…" : (hint ?? "Drop another audio file")}
        </p>
        {actions}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>
        {picker}
      </div>
    );
  }

  return (
    <div
      {...dropHandlers}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed bg-card px-6 py-10 text-center transition-colors duration-150 ease-out",
        over && "border-ring bg-muted/50",
        busy && "opacity-60"
      )}
    >
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        {busy ? <Spinner /> : <Music />}
      </span>

      <div className="grid gap-1">
        <p className="text-sm font-medium">
          {busy ? "Transcribing…" : "Drop an audio file to transcribe"}
        </p>
        <p className="text-xs text-muted-foreground">
          {hint ?? "MP3, WAV, M4A, FLAC, OGG — anything your browser can decode"}
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        Choose file
      </Button>

      {picker}
    </div>
  );
}
