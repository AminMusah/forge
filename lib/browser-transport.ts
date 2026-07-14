import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

import { useModelLoadStore } from "@/hooks/use-model-load-store";
import {
  computeWaveform,
  decodeToMono16k,
  lastAudio,
  rememberWaveform,
} from "@/lib/audio";
import type { HfTask } from "@/lib/hf-tasks";
import { DEFAULT_DTYPE, type Dtype } from "@/lib/model-cache";
import type {
  ChatTurn,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/browser-model.worker";

const setStatus = (status: string | null) =>
  useModelLoadStore.getState().setStatus(status);

/**
 * Makes a model running on the user's own GPU look exactly like the chat API.
 * Because it satisfies the AI SDK's ChatTransport, everything downstream —
 * per-token persistence, stop, regenerate, the reasoning split, the message
 * list — works unchanged: the Conversation module never learns where the
 * tokens came from, or even that a transcription isn't a reply.
 */

/** One worker, one warm model — see browser-model.worker.ts. */
let worker: Worker | null = null;

export function getWorker(): Worker {
  worker ??= new Worker(new URL("./browser-model.worker.ts", import.meta.url), {
    type: "module",
  });
  return worker;
}

/**
 * Downloads and compiles a model ahead of use. Resolves once it's warm, so the
 * first message streams immediately instead of paying the WebGPU compile.
 */
export function preloadModel(
  modelId: string,
  dtype: Dtype,
  onProgress?: (status: string) => void,
  task: HfTask = "text-generation"
): Promise<void> {
  const worker = getWorker();
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.id !== id) return;

      if (data.type === "progress") onProgress?.(data.text);
      else if (data.type === "done") {
        worker.removeEventListener("message", onMessage);
        resolve();
      } else if (data.type === "error") {
        worker.removeEventListener("message", onMessage);
        reject(new Error(data.message));
      }
    };

    worker.addEventListener("message", onMessage);
    worker.postMessage({
      type: "preload",
      id,
      modelId,
      dtype,
      task,
    } satisfies WorkerRequest);
  });
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
    private readonly dtype: Dtype = DEFAULT_DTYPE,
    private readonly task: HfTask = "text-generation"
  ) {}

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const worker = getWorker();
    const requestId = crypto.randomUUID();
    const { modelId, dtype, task } = this;

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        const answerId = crypto.randomUUID();
        let answerOpen = false;

        const finish = () => {
          setStatus(null);
          if (answerOpen) controller.enqueue({ type: "text-end", id: answerId });
          controller.enqueue({ type: "finish" });
          controller.close();
          cleanup();
        };

        const fail = (message: string) => {
          setStatus(null);
          controller.error(new Error(message));
          cleanup();
        };

        const onMessage = (event: MessageEvent<WorkerResponse>) => {
          const data = event.data;
          if (data.id !== requestId) return;

          switch (data.type) {
            case "progress":
              // Transient UI state — never conversation content. Putting it in
              // the transcript re-ran persistence and markdown parsing on every
              // one of hundreds of callbacks.
              setStatus(data.text);
              break;
            case "token": {
              setStatus(null);
              if (!answerOpen) {
                controller.enqueue({ type: "text-start", id: answerId });
                answerOpen = true;
              }
              controller.enqueue({
                type: "text-delta",
                id: answerId,
                delta: data.delta,
              });
              break;
            }
            case "done":
              finish();
              break;
            case "error":
              fail(data.message);
              break;
          }
        };

        const onAbort = () => {
          worker.postMessage({ type: "interrupt" } satisfies WorkerRequest);
        };

        const cleanup = () => {
          worker.removeEventListener("message", onMessage);
          abortSignal?.removeEventListener("abort", onAbort);
        };

        worker.addEventListener("message", onMessage);
        abortSignal?.addEventListener("abort", onAbort);

        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "start-step" });

        if (task === "automatic-speech-recognition") {
          const clip = lastAudio(messages);
          if (!clip) {
            fail("That clip is no longer loaded. Drop the file again.");
            return;
          }

          // Decoding is main-thread work by necessity (AudioContext), and it
          // must finish before the worker has anything to transcribe.
          setStatus("Reading audio…");
          void decodeToMono16k(clip.url)
            .then((audio) => {
              // The waveform is a by-product of a decode we were doing anyway —
              // cache it so the player doesn't decode this clip a second time
              // just to draw it.
              rememberWaveform(clip.id, computeWaveform(audio));

              worker.postMessage({
                type: "transcribe",
                id: requestId,
                modelId,
                dtype,
                audio,
              } satisfies WorkerRequest);
            })
            .catch((error: unknown) => {
              fail(error instanceof Error ? error.message : String(error));
            });
          return;
        }

        worker.postMessage({
          type: "generate",
          id: requestId,
          modelId,
          dtype,
          messages: toChatTurns(messages),
        } satisfies WorkerRequest);
      },
    });
  }

  /** Nothing to reconnect to — the stream never left the browser. */
  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
