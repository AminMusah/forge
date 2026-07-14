import type { UIMessage } from "ai";

/**
 * Audio for transcription: reading a clip, drawing it, and the one shape Whisper
 * accepts.
 *
 * The bytes themselves live on the message (MessageFile.url) and are stripped
 * before the store is persisted — so a clip survives navigation but not a
 * reload. Nothing here caches them.
 */

export function forgetWaveform(messageId: string): void {
  waveforms.delete(messageId);
}

/** A drawable summary of a clip: one peak per bar, plus how long it runs. */
export interface Waveform {
  peaks: number[];
  duration: number;
}

/** messageId → peaks. Session-scoped, like the bytes they were computed from. */
const waveforms = new Map<string, Waveform>();

export function rememberWaveform(messageId: string, waveform: Waveform): void {
  waveforms.set(messageId, waveform);
}

export function waveformFor(messageId: string): Waveform | undefined {
  return waveforms.get(messageId);
}

/** How many bars the waveform is drawn with. */
const BUCKETS = 1000;

/**
 * Buckets samples into peaks for display. Keeping the SAMPLES instead would mean
 * holding ~230MB for an hour of 16kHz audio; a thousand floats draws the same
 * picture. Peak-per-bucket (not average) is what preserves transients — averaging
 * flattens speech into a mush that tells you nothing about where the words are.
 */
export function computeWaveform(samples: Float32Array): Waveform {
  const size = Math.max(1, Math.floor(samples.length / BUCKETS));
  const peaks: number[] = [];

  for (let start = 0; start < samples.length; start += size) {
    let peak = 0;
    const end = Math.min(start + size, samples.length);
    for (let i = start; i < end; i++) {
      const magnitude = Math.abs(samples[i]);
      if (magnitude > peak) peak = magnitude;
    }
    peaks.push(peak);
  }

  return { peaks, duration: samples.length / SAMPLE_RATE };
}

/**
 * A data URL rather than an object URL: the same string has to survive being put
 * in a request body for the server route, and an `blob:` URL means nothing to
 * anyone but this document.
 */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Couldn't read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

/**
 * The clip to transcribe: the LAST file in the conversation. Earlier turns are
 * already transcribed, and after a reload their bytes are gone anyway — the
 * store keeps the transcript, not the audio.
 *
 * Returns the message id alongside the url, because whoever decodes this clip
 * can cache its waveform against that id and save the view a second decode.
 */
export function lastAudio(
  messages: UIMessage[]
): { id: string; url: string } | undefined {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type === "file" && part.url) {
        return { id: message.id, url: part.url };
      }
    }
  }
  return undefined;
}

/** Whisper is trained on 16kHz mono; anything else has to be resampled to it. */
const SAMPLE_RATE = 16000;

/** A dropped file (data URL) — see decode. */
export async function decodeToMono16k(url: string): Promise<Float32Array> {
  return decode(await (await fetch(url)).arrayBuffer());
}

/** A recording straight off the microphone — see decode. */
export async function decodeBlobToMono16k(blob: Blob): Promise<Float32Array> {
  return decode(await blob.arrayBuffer());
}

/**
 * Root-mean-square amplitude. Near zero means the microphone was live but heard
 * nothing — muted hardware, or the wrong input device.
 */
export function loudness(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sumOfSquares = 0;
  for (const sample of samples) sumOfSquares += sample * sample;
  return Math.sqrt(sumOfSquares / samples.length);
}

/**
 * Decodes any audio the browser can read into the Float32 samples the local
 * Whisper pipeline wants. Runs on the main thread by necessity — decodeAudioData
 * lives on AudioContext, which workers don't have.
 */
async function decode(encoded: ArrayBuffer): Promise<Float32Array> {
  // Decoding *through* a 16kHz context is what resamples: a file is typically
  // 44.1 or 48kHz, and decodeAudioData renders to the context's own rate.
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const buffer = await context.decodeAudioData(encoded);
    if (buffer.numberOfChannels === 1) {
      // Copy: the AudioBuffer's view dies with the context we're about to close.
      return new Float32Array(buffer.getChannelData(0));
    }

    // Downmix. Taking channel 0 alone would drop whatever was panned right —
    // in an interview recording that can be the entire other speaker.
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) / 2;
    return mono;
  } catch {
    throw new Error("That file isn't audio this browser can decode.");
  } finally {
    void context.close();
  }
}
