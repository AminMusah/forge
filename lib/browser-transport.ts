import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

import { useModelLoadStore } from "@/hooks/use-model-load-store";
import type { HfTask } from "@/lib/hf-tasks";
import { DEFAULT_DTYPE, type Dtype } from "@/lib/model-cache";
import { request } from "@/lib/worker-client";
import { useModelPerfStore } from "@/hooks/use-model-perf-store";
import type { ChatTurn } from "@/lib/browser-model.worker";

const setStatus = (status: string | null) =>
  useModelLoadStore.getState().setStatus(status);

/**
 * Makes a model running on the user's own GPU look exactly like the chat API.
 * Because it satisfies the AI SDK's ChatTransport, everything downstream —
 * per-token persistence, stop, regenerate, the reasoning split, the message
 * list — works unchanged: the Conversation module never learns where the
 * tokens came from, or even that a transcription isn't a reply.
 */

/**
 * Downloads and compiles a model ahead of use. Resolves once it's warm, so the
 * first message streams immediately instead of paying the WebGPU compile.
 */
export async function preloadModel(
  modelId: string,
  dtype: Dtype,
  onProgress?: (status: string) => void,
  task: HfTask = "text-generation"
): Promise<void> {
  await request({ type: "preload", modelId, dtype, task }, { onProgress });
}

/**
 * Transcribes samples directly, outside any conversation. Dictation is not a
 * chat turn — it produces text for the composer, not a message — so it talks to
 * the worker rather than going through a transport and the Chat instance.
 */
export async function transcribeSamples(
  audio: Float32Array,
  modelId: string,
  dtype: Dtype,
  onProgress?: (status: string) => void
): Promise<string> {
  const { text } = await request(
    { type: "transcribe", modelId, dtype, audio },
    {
      onProgress,
      // Recorded here rather than at the call sites, so playground ASR and
      // dictation both report without either having to remember to.
      onStats: (stats) =>
        useModelPerfStore.getState().setStats(modelId, stats),
    }
  );
  return text;
}

function toChatTurns(messages: UIMessage[]): ChatTurn[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as ChatTurn["role"],
      content: m.parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join(""),
    }))
    .filter((m) => m.content);
}

export class BrowserTransport implements ChatTransport<UIMessage> {
  constructor(
    private readonly modelId: string,
    private readonly dtype: Dtype = DEFAULT_DTYPE
  ) {}

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const { modelId, dtype } = this;

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        const answerId = crypto.randomUUID();
        let answerOpen = false;

        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "start-step" });

        // BrowserTransport serves CHAT only — every other task runs in a
        // PlaygroundView through the forge bridge, not here.
        request(
          { type: "generate", modelId, dtype, messages: toChatTurns(messages) },
          {
            // Transient UI state — never conversation content. Putting it in
            // the transcript re-ran persistence and markdown parsing on every
            // one of hundreds of callbacks.
            onProgress: setStatus,
            onToken: (delta) => {
              setStatus(null);
              if (!answerOpen) {
                controller.enqueue({ type: "text-start", id: answerId });
                answerOpen = true;
              }
              controller.enqueue({ type: "text-delta", id: answerId, delta });
            },
            onStats: (stats) =>
              useModelPerfStore.getState().setStats(modelId, stats),
            abortSignal,
          }
        )
          .then(() => {
            setStatus(null);
            if (answerOpen)
              controller.enqueue({ type: "text-end", id: answerId });
            controller.enqueue({ type: "finish" });
            controller.close();
          })
          .catch((error: unknown) => {
            setStatus(null);
            controller.error(
              error instanceof Error ? error : new Error(String(error))
            );
          });
      },
    });
  }

  /** Nothing to reconnect to — the stream never left the browser. */
  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
