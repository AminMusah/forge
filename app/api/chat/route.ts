import { groq } from "@ai-sdk/groq";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai";

import { models } from "@/lib/mock-data";

export async function POST(req: Request) {
  const { messages, modelId }: { messages: UIMessage[]; modelId?: string } =
    await req.json();

  const model = models.find((m) => m.id === modelId);
  if (!model || model.task !== "text-generation") {
    return Response.json(
      { error: `"${modelId}" is not an available text-generation model.` },
      { status: 400 }
    );
  }

  const result = streamText({
    model: groq(model.id),
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
