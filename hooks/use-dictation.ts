"use client";

import * as React from "react";
import { toast } from "sonner";

import { preloadModel, transcribeSamples } from "@/lib/browser-transport";
import {
  DICTATION_DTYPE,
  DICTATION_MODEL_ID,
  MicRecorder,
  SILENCE_LEVEL,
  micError,
} from "@/lib/dictation";
import { hasWebGPU } from "@/lib/model-cache";

export type DictationStatus = "idle" | "recording" | "transcribing";

/**
 * An open microphone shouldn't quietly accumulate: Whisper windows at 30s, and
 * the samples are held whole. Two minutes is a long message and a short accident.
 */
const MAX_SECONDS = 120;

/**
 * Speaking into the composer. Owns the microphone, the local Whisper call, and
 * the failures — the caller gets text and four verbs.
 *
 * Local state rather than a store: only the composer dictates, and nothing else
 * in the app needs to know that it's listening.
 */
export function useDictation(onTranscript: (text: string) => void) {
  const [status, setStatus] = React.useState<DictationStatus>("idle");
  const [progress, setProgress] = React.useState<string | null>(null);
  const [seconds, setSeconds] = React.useState(0);
  const recorderRef = React.useRef<MicRecorder | null>(null);

  // Read at call time, so a fresh handler each render doesn't churn the
  // callbacks below (and with them the timer and key-listener effects).
  const onTranscriptRef = React.useRef(onTranscript);
  React.useLayoutEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  const start = React.useCallback(async () => {
    const recorder = new MicRecorder();
    try {
      await recorder.start();
    } catch (error) {
      toast.error(micError(error));
      return;
    }

    recorderRef.current = recorder;
    setSeconds(0);
    setStatus("recording");

    // Warm the weights WHILE they talk. Loading only once they stop would put a
    // cold download — by far the slowest part — between speaking and seeing
    // text. Failures aren't surfaced here; transcribing reports them.
    void preloadModel(
      DICTATION_MODEL_ID,
      DICTATION_DTYPE,
      setProgress,
      "automatic-speech-recognition"
    ).catch(() => {});
  }, []);

  const stop = React.useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    setStatus("transcribing");

    try {
      const { samples, level } = await recorder.stop();

      // Whisper hallucinates caption tags on silence, and the worker strips
      // them — so a dead mic would otherwise yield nothing, with no explanation.
      if (level < SILENCE_LEVEL) {
        toast.error("No audio came through — check your microphone.");
        return;
      }

      const text = await transcribeSamples(
        samples,
        DICTATION_MODEL_ID,
        DICTATION_DTYPE,
        setProgress
      );
      if (!text) {
        toast.error("Didn't catch that — try again.");
        return;
      }

      onTranscriptRef.current(text);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't transcribe that."
      );
    } finally {
      setStatus("idle");
      setProgress(null);
    }
  }, []);

  /** Throw the recording away. Only meaningful while still recording. */
  const cancel = React.useCallback(() => {
    if (!recorderRef.current) return;
    recorderRef.current.cancel();
    recorderRef.current = null;
    setStatus("idle");
    setProgress(null);
  }, []);

  // Tick the elapsed time, and stop at the cap.
  React.useEffect(() => {
    if (status !== "recording") return;

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) void stop();
    }, 1000);

    return () => clearInterval(timer);
  }, [status, stop]);

  // Escape gets you out. The mic starts from a click, so the textarea doesn't
  // have focus and its key handler would never see the key.
  React.useEffect(() => {
    if (status !== "recording") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, cancel]);

  // Navigating away mid-recording must release the mic, or the browser goes on
  // showing the tab as listening.
  React.useEffect(() => () => recorderRef.current?.cancel(), []);

  return { status, progress, seconds, start, stop, cancel };
}

/**
 * Whether this browser can dictate at all. Resolved after mount, never during
 * render: WebGPU is absent on the server and present on the client, and
 * branching on it while rendering would be a hydration mismatch.
 */
export function useCanDictate(): boolean {
  const [can, setCan] = React.useState(true);
  React.useEffect(() => setCan(hasWebGPU()), []);
  return can;
}
