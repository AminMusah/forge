import { cookies } from "next/headers";
import { z } from "zod";
import { generateText } from "ai";

import { describeError } from "@/lib/hf-router";
import {
  buildCodegenPrompt,
  extractCode,
} from "@/lib/playground/codegen-prompt";
import {
  FREE_CODEGEN_LIMIT,
  codegenModel,
  freeCodegenModel,
} from "@/lib/playground/codegen-provider";
import {
  CODEGEN_COOKIE,
  parseConnection,
} from "@/lib/connection";
import { isHostedDeploy } from "@/lib/connection-policy";
import { descriptorFor } from "@/lib/playground/descriptors";
import { hfTasks, type HfTask } from "@/lib/hf-tasks";

/**
 * Generates a playground UI for a task, from its descriptor.
 *
 * Resolution: the user's BYO connection wins (their key, unlimited); with none,
 * the free shared key writes the browser's first FREE_CODEGEN_LIMIT playgrounds
 * as a first-run taste (when the operator opted in), then it's BYO. That cap
 * applies on a hosted deploy only — see the `metered` comment below. See
 * codegen-provider.ts.
 */

/**
 * How many free generations this browser has spent. httpOnly so page JS can't
 * clear it. It reads as a count, which is also why the old boolean "1" written
 * by the one-shot version still means exactly "one spent" — no migration needed.
 */
const FREE_USED_COOKIE = "codegen_free_used";

/** Spent count from the cookie; anything malformed counts as none spent. */
function freeUsed(value: string | undefined): number {
  const used = Number(value);
  return Number.isInteger(used) && used > 0 ? used : 0;
}

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

  // Metering exists to bound the OPERATOR's bill against anonymous visitors on a
  // public deploy. Running the repo locally there are none — it's the
  // developer's own key, on their own machine, billed to them — so a cap there
  // is friction that protects nobody. Unmetered locally, capped on a deploy.
  const metered = isHostedDeploy();
  const used = freeUsed(store.get(FREE_USED_COOKIE)?.value);

  // The user's own key wins outright. With none, offer the free shared key —
  // on a deploy, only while this browser is under its allowance.
  let codegen = codegenModel({ connection });
  let usingFree = false;
  if (!codegen && (!metered || used < FREE_CODEGEN_LIMIT)) {
    codegen = freeCodegenModel();
    usingFree = codegen !== null;
  }
  if (!codegen) {
    // Free allowance spent (or never offered) and no BYO connection.
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

    // Spend a free generation only on success — a failed or aborted attempt
    // shouldn't burn one of the visitor's few. Nothing to spend when unmetered:
    // writing a counter nobody reads would only confuse the next reader.
    if (usingFree && metered) {
      store.set(FREE_USED_COOKIE, String(used + 1), {
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
