import { cookies } from "next/headers";
import { z } from "zod";
import { generateText } from "ai";

import { TOKEN_COOKIE } from "@/app/api/token/route";
import { describeError } from "@/lib/hf-router";
import {
  buildCodegenPrompt,
  extractCode,
} from "@/lib/playground/codegen-prompt";
import { codegenModel } from "@/lib/playground/codegen-provider";
import { descriptorFor } from "@/lib/playground/descriptors";
import { hfTasks, type HfTask } from "@/lib/hf-tasks";

/**
 * Generates a playground UI for a task, from its descriptor. Cut-2 slice 1.
 *
 * Its own route and model, separate from /api/chat: codegen is a distinct,
 * user-choosable capability (see lib/playground/codegen-provider.ts). The
 * provider is resolved there — this route just builds the prompt and runs it.
 */

const bodySchema = z.object({
  task: z.enum(hfTasks as unknown as [string, ...string[]]),
  request: z.string().max(2000).optional(),
  previousCode: z.string().max(50000).optional(),
  instruction: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  // Codegen picks its own provider (Groq's free tier first); the HF cookie is
  // only a fallback, so a missing HF token isn't fatal when Groq is configured.
  const hfToken = (await cookies()).get(TOKEN_COOKIE)?.value;
  const codegen = codegenModel({ hfToken });
  if (!codegen) {
    return Response.json(
      { error: "No codegen provider configured (set GROQ_API_KEY or add an HF token)." },
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
