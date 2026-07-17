import { cookies } from "next/headers";
import { z } from "zod";
import { generateText } from "ai";

import { describeError } from "@/lib/hf-router";
import {
  buildCodegenPrompt,
  extractCode,
} from "@/lib/playground/codegen-prompt";
import { codegenModel } from "@/lib/playground/codegen-provider";
import {
  CODEGEN_COOKIE,
  parseConnection,
} from "@/lib/connection";
import { descriptorFor } from "@/lib/playground/descriptors";
import { hfTasks, type HfTask } from "@/lib/hf-tasks";

/**
 * Generates a playground UI for a task, from its descriptor.
 *
 * Its own route and model, separate from /api/chat: codegen is a distinct,
 * user-choosable capability (see lib/playground/codegen-provider.ts). The
 * provider is resolved there — this route just builds the prompt and runs it.
 */

const bodySchema = z.object({
  task: z.enum(hfTasks as unknown as [string, ...string[]]),
  // Generous: a detailed brief is a legitimate request, not abuse.
  request: z.string().max(16000).optional(),
  previousCode: z.string().max(50000).optional(),
  instruction: z.string().max(16000).optional(),
});

export async function POST(req: Request) {
  // Codegen is strictly bring-your-own: no BYO connection means no model, so
  // this route answers 401. There is deliberately no shared key (see
  // codegen-provider.ts) — a public deploy must not proxy the operator's credits.
  const connection = parseConnection(
    (await cookies()).get(CODEGEN_COOKIE)?.value
  );
  const codegen = codegenModel({ connection });
  if (!codegen) {
    return Response.json(
      { error: "Add a codegen provider to generate playgrounds." },
      { status: 401 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const { task, request, previousCode, instruction } = parsed.data;

  const descriptor = descriptorFor(task as HfTask);
  if (!descriptor) {
    return Response.json(
      { error: `No playground descriptor for ${task}.` },
      { status: 400 }
    );
  }

  const { system, prompt } = buildCodegenPrompt(
    task,
    descriptor,
    request ?? "",
    { previousCode, instruction }
  );

  try {
    const { text } = await generateText({
      model: codegen.model,
      system,
      prompt,
      // A full single-file playground is a few hundred lines; give it room.
      maxOutputTokens: 4000,
      maxRetries: 2,
      abortSignal: req.signal,
    });

    const code = extractCode(text);
    if (!code) {
      return Response.json(
        { error: "The model returned no code." },
        { status: 502 }
      );
    }
    return Response.json({ code });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 502 });
  }
}
