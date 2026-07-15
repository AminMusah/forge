/**
 * Decoding audio into the Float32 samples the local Whisper pipeline wants.
 * Used by the playground bridge (a dropped clip) and by dictation (a recording).
 */

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
