import { cookies } from "next/headers";
import { z } from "zod";
import { APICallError, generateText, type LanguageModel } from "ai";

import { describeError } from "@/lib/hf-router";
import {
  buildCodegenPrompt,
  extractCode,
} from "@/lib/playground/codegen-prompt";
import {
  FREE_CODEGEN_LIMIT,
  codegenModel,
  freeCodegenModel,
  hfCodegenModel,
} from "@/lib/playground/codegen-provider";
import {
  CODEGEN_COOKIE,
  parseConnection,
} from "@/lib/connection";
import { isHostedDeploy } from "@/lib/connection-policy";
import { descriptorFor } from "@/lib/playground/descriptors";
import { hfTasks, type HfTask } from "@/lib/hf-tasks";
import { TOKEN_COOKIE } from "@/app/api/token/route";

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
  const hfToken = store.get(TOKEN_COOKIE)?.value;

  // Metering exists to bound the OPERATOR's bill against anonymous visitors on a
  // public deploy. Running the repo locally there are none — it's the
  // developer's own key, on their own machine, billed to them — so a cap there
  // is friction that protects nobody. Unmetered locally, capped on a deploy.
  const metered = isHostedDeploy();
  const used = freeUsed(store.get(FREE_USED_COOKIE)?.value);

  // 1. the user's explicit codegen key wins outright.
  let codegen = codegenModel({ connection });
  // Which rung is generating. `usingFree` already gates what a failure may say
  // and whether a generation is spent; `usingHfToken` additionally decides
  // whether a failure is allowed to fall through (see the catch below).
  let usingFree = false;
  let usingHfToken = false;
  // 2. else their HF token runs codegen on the router's coder — their own quota,
  //    unlimited, and NOT metered (usingFree stays false): it isn't the shared key.
  if (!codegen && hfToken) {
    codegen = hfCodegenModel(hfToken);
    usingHfToken = true;
  }
  // 3. else the operator's free doormat, capped, on a hosted deploy.
  if (!codegen && (!metered || used < FREE_CODEGEN_LIMIT)) {
    codegen = freeCodegenModel();
    usingFree = codegen !== null;
  }
  if (!codegen) {
    // No key, no HF token, and the free taste is spent — convert the wall.
    return Response.json(
      {
        error:
          "You've used your free playgrounds. Add your Hugging Face token — it powers cloud chat and unlimited codegen, on your own account.",
      },
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

  const generate = (model: LanguageModel) =>
    generateText({
      model,
      system,
      prompt,
      // A full single-file playground is a few hundred lines; give it room.
      maxOutputTokens: 4000,
      maxRetries: 2,
      abortSignal: req.signal,
    });

  try {
    let text: string;
    try {
      ({ text } = await generate(codegen.model));
    } catch (error) {
      // An HF token with nothing left in it must not leave the visitor WORSE OFF
      // than one who never added a token: rung 2 sits above the doormat, so a
      // dead rung 2 falls through to rung 3 rather than dead-ending. Depleted
      // credits arrive as a 402 — lib/hf-router.ts digs that status out of the
      // HTTP 200 the router hides it in — which is exactly the permanent-failure
      // signal to switch on. Anything else (a cold start, a 5xx) is transient and
      // must NOT burn the doormat.
      const outOfCredits =
        usingHfToken &&
        APICallError.isInstance(error) &&
        error.statusCode === 402;
      const fallback =
        outOfCredits && (!metered || used < FREE_CODEGEN_LIMIT)
          ? freeCodegenModel()
          : null;
      if (!fallback) {
        // No doormat to fall to (not opted in, or the taste is spent). 402, not
        // 502: retrying cannot clear this, and the client keys the dead-end wall
        // off exactly that status.
        if (outOfCredits) {
          return Response.json(
            {
              error:
                "Your Hugging Face credits are used up — they reset monthly. Add a codegen provider with your own key to keep generating now.",
            },
            { status: 402 }
          );
        }
        throw error;
      }
      // The doormat is generating now, so it owns both the failure vocabulary
      // and the spend — a fallback generation costs the visitor one of its free
      // playgrounds, same as if they'd never had a token.
      usingHfToken = false;
      usingFree = true;
      ({ text } = await generate(fallback.model));
    }

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
    // The shared free key runs on Groq's free tier, whose token-per-minute
    // budget is ORG-WIDE — so a second visitor generating in the same minute is
    // enough to trip this. It's a busy signal, not a failure, and it deserves
    // 429 plus a next step rather than a generic 502.
    if (APICallError.isInstance(error) && error.statusCode === 429) {
      return Response.json(
        {
          error: usingFree
            ? "Free playgrounds are busy right now — add your Hugging Face token to skip the shared queue with your own quota, or wait a moment and try again."
            : "Your codegen provider is rate-limiting this request. Wait a moment and try again.",
        },
        { status: 429 }
      );
    }
    // A BYO failure repeats what the provider said, because that's how the user
    // fixes a bad key or model id. A failure on the SHARED key must not: those
    // messages name the operator's organization and quota, which tells the
    // visitor nothing actionable and us rather more than it should.
    return Response.json(
      {
        error: usingFree
          ? "The free playground service failed. Try again, or add your own codegen provider."
          : describeError(error),
      },
      { status: 502 }
    );
  }
}
