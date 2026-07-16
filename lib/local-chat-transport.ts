import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  extractReasoningMiddleware,
  streamText,
  toUIMessageStream,
  wrapLanguageModel,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

import { useChatProviderStore } from "@/hooks/use-chat-provider-store";
import { THINK_TAG } from "@/lib/reasoning";

/**
 * Chat against a LOCAL (Ollama) endpoint straight from the browser — the peer of
 * BrowserTransport for a model that runs on the user's machine but over HTTP
 * rather than WebGPU. A hosted server can't reach the user's localhost, so the
 * call must originate here; a keyless local endpoint has nothing to protect.
 *
 * Like BrowserTransport, it satisfies the AI SDK's ChatTransport, so everything
 * downstream (persistence, stop, regenerate, the reasoning split) is unchanged —
 * the Conversation module never learns the tokens came from localhost.
 */
export class LocalChatTransport implements ChatTransport<UIMessage> {
  constructor(private readonly reasoning: boolean = false) {}

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    // Resolve the connection at send time so a mid-chat change takes effect.
    const { baseURL, modelId } = useChatProviderStore.getState();
    if (!baseURL || !modelId) {
      throw new Error("No local chat provider configured.");
    }

    const model = wrapLanguageModel({
      // A local endpoint ignores auth; a placeholder key satisfies clients that
      // always attach a bearer.
      model: createOpenAICompatible({
        name: "local-chat",
        baseURL,
        apiKey: "local",
      })(modelId),
      middleware: extractReasoningMiddleware({
        tagName: THINK_TAG,
        startWithReasoning: this.reasoning,
      }),
    });

    const result = streamText({
      model,
      messages: await convertToModelMessages(messages),
      abortSignal,
      maxRetries: 1,
    });

    return toUIMessageStream({
      stream: result.stream,
      sendReasoning: true,
      onError: (error) => (error instanceof Error ? error.message : String(error)),
    });
  }

  /** Nothing to reconnect to — the stream never left the browser. */
  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
