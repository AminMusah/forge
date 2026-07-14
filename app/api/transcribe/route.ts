import { cookies } from "next/headers";
import { z } from "zod";
import {
  InferenceClient,
  type InferenceProviderOrPolicy,
} from "@huggingface/inference";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { TOKEN_COOKIE } from "@/app/api/token/route";

/**
 * Server-side transcription, via Hugging Face Inference Providers.
 *
 * The router serves only a handful of ASR models, but the ones it has are the
 * big ones — whisper-large-v3 is far beyond what a browser can hold. That's the
 * trade this route exists for: quality (and someone else's GPU) in exchange for
 * a token and the clip leaving the machine. The browser runtime is the private,
 * free alternative, and the user picks per model.
 *
 * ASR is one-shot — the provider returns the whole transcript, not a token
 * stream — but the response is still a UI message stream, so the client can't
 * tell a transcription from a chat reply and every downstream part is reused.
 */

/** The router rejects very large uploads; fail here with a reason instead. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const bodySchema = z.object({
  // A data URL: the audio never touches the chat store, so the client hands the
  // bytes over per request rather than the server fetching them from anywhere.
  audio: z.string().startsWith("data:"),
  modelId: z.string().min(1).max(200),
  provider: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

/** data:audio/mpeg;base64,… → a Blob the inference client can post. */
function decodeDataUrl(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(5, comma);
  if (comma === -1 || !header.includes("base64")) {
    throw new Error("Audio must be a base64 data URL.");
  }

  const mediaType = header.split(";")[0] || "application/octet-stream";
  const bytes = Buffer.from(dataUrl.slice(comma + 1), "base64");
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("That file is too large to transcribe (25MB max).");
  }
  return new Blob([bytes], { type: mediaType });
}

export async function POST(req: Request) {
  // Forge holds no provider key: the caller brings their own, so a public
  // deploy can't be used as a proxy to someone else's credits.
  const apiKey = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!apiKey) {
    return Response.json(
      { error: "Add your Hugging Face token to transcribe on the server." },
      { status: 401 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const { audio, modelId, provider } = parsed.data;

  let clip: Blob;
  try {
    clip = decodeDataUrl(audio);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid audio." },
      { status: 413 }
    );
  }

  const client = new InferenceClient(apiKey);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const { text } = await client.automaticSpeechRecognition({
        inputs: clip,
        model: modelId,
        // Pinned for single-provider models; the router auto-routes otherwise.
        // The regex above is the real guard — this cast only tells TypeScript
        // that a validated string is one of the router's known provider names.
        ...(provider
          ? { provider: provider as InferenceProviderOrPolicy }
          : {}),
      });

      const transcript = text?.trim();
      if (!transcript) throw new Error("No speech was found in that audio.");

      // One shot, presented as a stream of exactly one delta.
      const id = crypto.randomUUID();
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: transcript });
      writer.write({ type: "text-end", id });
    },
    // Without this the SDK masks the failure — and a provider that's cold, out
    // of credits, or simply doesn't serve this model is exactly what the user
    // needs told.
    onError: (error) =>
      error instanceof Error ? error.message : "Transcription failed.",
  });

  return createUIMessageStreamResponse({ stream });
}
