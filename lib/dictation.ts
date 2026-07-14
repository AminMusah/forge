import { decodeBlobToMono16k, loudness } from "@/lib/audio";
import { DEFAULT_DTYPE, type Dtype } from "@/lib/model-cache";

/**
 * Dictation: speaking into the composer instead of typing.
 *
 * It always runs LOCALLY, whatever model the chat is pinned to — the chat's
 * model is a text generator and can't transcribe anything, so dictation needs a
 * model of its own. Local is the right default for it: you'll use it dozens of
 * times an hour, and a microphone that quietly uploads your voice to a third
 * party on every message is not something to opt you into. No token, no credits,
 * nothing leaves the machine.
 */
export const DICTATION_MODEL_ID = "onnx-community/whisper-base";
export const DICTATION_DTYPE: Dtype = DEFAULT_DTYPE;

/** Below this RMS the clip is silence: a muted mic, not a quiet talker. */
export const SILENCE_LEVEL = 0.001;

export interface Recording {
  /** Mono 16kHz samples, ready for Whisper. */
  samples: Float32Array;
  /** RMS amplitude — near zero means the mic heard nothing at all. */
  level: number;
}

/** Records the microphone and hands back the only shape Whisper accepts. */
export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("This browser can't record audio.");
    }

    // Ask for what Whisper wants. The browser won't always honour the sample
    // rate — decoding resamples anyway — but the cleanup helps a small model.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) this.chunks.push(event.data);
    });
    this.recorder.start();
  }

  /** Stops the microphone and decodes what was captured. */
  async stop(): Promise<Recording> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Not recording.");

    // The final chunk only lands on the stop event — reading immediately after
    // calling stop() truncates the tail of the recording.
    const flushed = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    if (recorder.state !== "inactive") recorder.stop();
    await flushed;

    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    this.release();

    if (!blob.size) return { samples: new Float32Array(), level: 0 };

    const samples = await decodeBlobToMono16k(blob);
    return { samples, level: loudness(samples) };
  }

  /** Drops the recording and releases the microphone. Nothing is transcribed. */
  cancel(): void {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
    this.release();
  }

  private release(): void {
    // Stopping the tracks is what clears the browser's recording indicator. Skip
    // it and the tab looks like it's still listening long after we've stopped.
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}

export function micError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") {
    return "Microphone access was denied. Allow it in your browser's site settings.";
  }
  if (name === "NotFoundError") return "No microphone found.";
  return "Couldn't start the microphone.";
}
