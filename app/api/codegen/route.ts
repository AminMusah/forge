import { cookies } from "next/headers";
import { z } from "zod";
import { generateText } from "ai";

import { describeError } from "@/lib/hf-router";
import {
  buildCodegenPrompt,
  extractCode,
} from "@/lib/playground/codegen-prompt";
import {
  codegenModel,
  freeCodegenModel,
} from "@/lib/playground/codegen-provider";
import {
  CODEGEN_COOKIE,
  parseConnection,
} from "@/lib/connection";
import { descriptorFor } from "@/lib/playground/descriptors";
import { hfTasks, type HfTask } from "@/lib/hf-tasks";

/**
 * Generates a playground UI for a task, from its descriptor.
 *
 * Resolution: the user's BYO connection wins (their key, unlimited); with none,
 * the free shared key writes ONE playground per browser as a first-run taste
 * (when the operator opted in), then it's BYO. See codegen-provider.ts.
 */

/** Marks a browser's one free generation as spent. httpOnly so JS can't clear it. */
const FREE_USED_COOKIE = "codegen_free_used";

const bodySchema = z.object({
  task: z.enum(hfTasks as unknown as [string, ...string[]]),
  // Generous: a detailed brief is a legitimate request, not abuse.
  request: z.string().max(16000).optional(),
  previousCode: z.string().max(50000).optional(),
  instruction: z.string().max(16000).optional(),
});

export async function POST(req: Request) {
  const store = await cookies();
  const connection = parseConnection(store.get(CODEGEN_COOKIE)?.value);

  // The user's own key wins outright. With none, offer the free shared key —
  // but only if this browser hasn't spent its one free generation yet.
  let codegen = codegenModel({ connection });
  let usingFree = false;
  if (!codegen && store.get(FREE_USED_COOKIE)?.value !== "1") {
    codegen = freeCodegenModel();
    usingFree = codegen !== null;
  }
  if (!codegen) {
    // Free generation spent (or never offered) and no BYO connection.
    return Response.json(
      { error: "Add your own codegen provider to keep building playgrounds." },
      { status: 402 }
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

    // Spend the free generation only on success — a failed or aborted attempt
    // shouldn't burn the visitor's one taste.
    if (usingFree) {
      store.set(FREE_USED_COOKIE, "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return Response.json({ code });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 502 });
  }
}
