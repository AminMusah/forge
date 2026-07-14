"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import WaveSurfer from "wavesurfer.js";
import { Forward10s, Pause, Play, Rewind10s } from "reicon-react";

import { Button } from "@/components/ui/button";
import { IconSwap } from "@/components/ui/icon-swap";
import {
  computeWaveform,
  decodeToMono16k,
  rememberWaveform,
  waveformFor,
} from "@/lib/audio";
import { cn } from "@/lib/utils";

const SKIP_SECONDS = 10;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/** Wavesurfer paints to a canvas, which can't read a CSS variable itself. */
function token(name: string): string {
  if (typeof window === "undefined") return "#888";
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || "#888";
}

interface AudioPlayerProps {
  src: string;
  /** Keys the cached peaks — the clip's message. */
  messageId: string;
  className?: string;
}

/**
 * A transport for checking a transcript against what was actually said. The
 * waveform IS the scrub bar: it shows where the speech and the silences are, so
 * you can click the passage you're suspicious of instead of hunting with a
 * featureless slider. ±10s skip is the other control that job needs.
 *
 * Peaks come from the samples we already decoded for local Whisper — passing
 * them (with a duration) makes wavesurfer skip decoding entirely and use the url
 * for playback alone. A server-run transcription has no such samples, so it
 * decodes once here and caches the result.
 */
export function AudioPlayer({ src, messageId, className }: AudioPlayerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const waveRef = React.useRef<WaveSurfer | null>(null);
  const elapsedRef = React.useRef<HTMLSpanElement>(null);

  const [playing, setPlaying] = React.useState(false);
  const [duration, setDuration] = React.useState(0);
  const [ready, setReady] = React.useState(false);

  // Re-initialise on theme change: the colours are baked into the canvas at
  // draw time, so a light/dark switch has to repaint. (Resonance hardcodes hex
  // for this and quietly breaks in the other theme.)
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    setReady(false);
    setPlaying(false);

    const wave = WaveSurfer.create({
      container,
      height: 48,
      waveColor: token("--muted-foreground"),
      progressColor: token("--foreground"),
      cursorColor: token("--foreground"),
      cursorWidth: 1,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      barMinHeight: 1,
      normalize: true,
    });
    waveRef.current = wave;

    wave.on("ready", () => {
      setReady(true);
      setDuration(wave.getDuration());
    });
    wave.on("play", () => setPlaying(true));
    wave.on("pause", () => setPlaying(false));
    wave.on("finish", () => setPlaying(false));
    // Straight to the DOM, not through state: this fires continuously while
    // playing, and this app has been bitten by per-frame re-renders before.
    wave.on("timeupdate", (time) => {
      if (elapsedRef.current) elapsedRef.current.textContent = formatTime(time);
    });

    void (async () => {
      try {
        // Free on the local path — BrowserTransport cached these on its way to
        // Whisper. Only a server-run clip pays for a decode here.
        let waveform = waveformFor(messageId);
        if (!waveform) {
          waveform = computeWaveform(await decodeToMono16k(src));
          rememberWaveform(messageId, waveform);
        }
        if (disposed) return;
        await wave.load(src, [waveform.peaks], waveform.duration);
      } catch {
        // A clip we can't draw can still be played — fall back to letting
        // wavesurfer decode it, and if even that fails the controls stay idle.
        if (disposed) return;
        try {
          await wave.load(src);
        } catch {
          /* the transcript is the artifact; a dead player isn't worth a toast */
        }
      }
    })();

    return () => {
      disposed = true;
      wave.destroy();
      waveRef.current = null;
    };
  }, [src, messageId, resolvedTheme]);

  const skip = (by: number) => {
    const wave = waveRef.current;
    if (!wave) return;
    const time = Math.min(
      Math.max(wave.getCurrentTime() + by, 0),
      wave.getDuration()
    );
    wave.setTime(time);
    if (elapsedRef.current) elapsedRef.current.textContent = formatTime(time);
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="size-8 shrink-0 px-0 text-muted-foreground"
        aria-label={`Back ${SKIP_SECONDS} seconds`}
        disabled={!ready}
        onClick={() => skip(-SKIP_SECONDS)}
      >
        <Rewind10s />
      </Button>

      <Button
        type="button"
        size="icon"
        className="size-10 shrink-0 rounded-full"
        aria-label={playing ? "Pause" : "Play"}
        disabled={!ready}
        onClick={() => void waveRef.current?.playPause()}
      >
        <IconSwap showing={playing} on={<Pause />} off={<Play />} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="size-8 shrink-0 px-0 text-muted-foreground"
        aria-label={`Forward ${SKIP_SECONDS} seconds`}
        disabled={!ready}
        onClick={() => skip(SKIP_SECONDS)}
      >
        <Forward10s />
      </Button>

      <span
        ref={elapsedRef}
        className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums"
      >
        0:00
      </span>

      {/* Click-to-seek is wavesurfer's own — the waveform replaces the slider. */}
      <div ref={containerRef} className="min-w-0 flex-1" />

      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {formatTime(duration)}
      </span>
    </div>
  );
}
