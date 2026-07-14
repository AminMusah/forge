"use client";

import * as React from "react";
import { Image as ImageIcon, Music } from "reicon-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type DropKind = "audio" | "image";

const kinds = {
  audio: {
    accept: "audio/*",
    icon: <Music />,
    title: "Drop an audio file to transcribe",
    types: "MP3, WAV, M4A, FLAC, OGG — anything your browser can decode",
    again: "Drop another audio file",
    busy: "Transcribing…",
  },
  image: {
    accept: "image/*",
    icon: <ImageIcon />,
    title: "Drop an image to read",
    types: "PNG, JPEG, WEBP, GIF — anything your browser can decode",
    again: "Drop another image",
    busy: "Reading…",
  },
} as const;

interface FileDropzoneProps {
  kind: DropKind;
  onFile: (file: File) => void;
  /** True while the previous file is still being worked on. */
  busy?: boolean;
  hint?: string;
  /** Composer-sized: a single row, so it can sit under a thread like ChatInput. */
  compact?: boolean;
  /** Composer controls (model chip, task picker) — ChatInput has a toolbar. */
  actions?: React.ReactNode;
}

/**
 * Drop a file, or click to pick one. Knows nothing about what will be done with
 * it — the same control feeds transcription and image reading, and it's the
 * plumbing the composer's attachment button will want too.
 */
export function FileDropzone({
  kind,
  onFile,
  busy,
  hint,
  compact,
  actions,
}: FileDropzoneProps) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const copy = kinds[kind];

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
      accept={copy.accept}
      hidden
      onChange={(event) => {
        take(event.target.files);
        // Reset, or picking the same file twice fires no change event.
        event.target.value = "";
      }}
    />
  );

  // The composer form: one row, sized like ChatInput, so a thread reads as a
  // thread — the file you drop is the next message.
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
          {busy ? <Spinner /> : copy.icon}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {busy ? copy.busy : (hint ?? copy.again)}
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
        {busy ? <Spinner /> : copy.icon}
      </span>

      <div className="grid gap-1">
        <p className="text-sm font-medium">{busy ? copy.busy : copy.title}</p>
        <p className="text-xs text-muted-foreground">{hint ?? copy.types}</p>
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

      {actions}
      {picker}
    </div>
  );
}
