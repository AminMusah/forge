import type { TaskDescriptor } from "@/lib/playground/descriptors";

/**
 * The contract handed to the codegen model. This is the whole reason the
 * playground generalizes: the model is told the task's I/O (from the descriptor)
 * and the ONE way to reach the model (window.forge), and writes only the UI. It
 * never loads a model, never imports transformers, never sees the user's file.
 *
 * Kept pure so the prompt is inspectable and can be unit-tested against the
 * descriptor without a network.
 */

/** How the UI turns user input into a forge.run() call, per the descriptor. */
const INPUT_GUIDE: Record<TaskDescriptor["input"], string> = {
  image:
    "The user drops or picks an IMAGE file. Read it with `FileReader.readAsDataURL`, then call `forge.run({ image: dataUrl, options })`.",
  audio:
    "The user drops or picks an AUDIO file. Read it with `FileReader.readAsDataURL`, then call `forge.run({ audio: dataUrl, options })`.",
  text: "The user types TEXT into a textarea. Call `forge.run({ text, options })`.",
};

const RULES = `You generate a SINGLE-FILE React playground (TSX) for testing a machine-learning model in the browser. Output ONLY the code — no markdown fences, no prose, no explanation.

HARD ENVIRONMENT RULES (breaking any of these makes the app fail to load — they ALWAYS win over the user's request):
- The ONLY allowed imports are from "react" (hooks like useState) and "react-dom/client" (createRoot). Import NOTHING else — no UI kits, no CSS frameworks, no icon packs, no fetch of external scripts.
- Do not write \`import React from "react"\`; use named hook imports and the automatic JSX runtime.
- Style with inline \`style={{}}\` objects only. Tailwind/className styling does NOT work here — there is no CSS framework loaded. Assume a dark page (background #0b0b0c, text #e7e7e9).
- If the user asks for something unavailable — Tailwind, an icon library, a component kit — ADAPT: reproduce the look with inline styles, and draw any icons as small inline SVG. Deliver the intent, not the exact library.
- The document already has \`<div id="root"></div>\`. End the file with: \`createRoot(document.getElementById("root")).render(<App />);\`

THE MODEL — reach it ONLY through the injected global \`window.forge\`:
- \`window.forge.run(input, onProgress?): Promise<OUTPUT>\` runs the REAL model. Do NOT load the model, do NOT import transformers, and do NOT fabricate mock/fake results even if the request asks for it — window.forge.run IS the data source.
- \`onProgress\` is \`(text: string) => void\`, called with status text (e.g. download progress) while it runs — surface it as a loading state.
- The FIRST run downloads model weights and can take many seconds; make the loading state honest and non-blocking.`;

interface CodegenPromptOptions {
  /** For a Modify turn: the current file to edit rather than start fresh. */
  previousCode?: string;
  /** The user's modify instruction, when editing. */
  instruction?: string;
}

export function buildCodegenPrompt(
  task: string,
  descriptor: TaskDescriptor,
  userRequest: string,
  options: CodegenPromptOptions = {}
): { system: string; prompt: string } {
  const system = `${RULES}

THIS MODEL (task: ${task}):
- INPUT: ${descriptor.inputHint ?? INPUT_GUIDE[descriptor.input]}
- OUTPUT (what forge.run resolves to): ${descriptor.output}
- WHAT TO BUILD: ${descriptor.hint}
- Always provide the input control (a drop zone AND a file picker for file inputs), a running/loading state driven by onProgress, and a visible error state.`;

  // A Modify turn edits the current file; a fresh turn builds from the request.
  const prompt =
    options.previousCode && options.instruction
      ? `Here is the current playground. Apply this change, keep everything that still works, and return the FULL updated file:\n\nCHANGE: ${options.instruction}\n\nCURRENT CODE:\n${options.previousCode}`
      : userRequest ||
        `Build a playground to test this ${task} model.`;

  return { system, prompt };
}

/**
 * Coder models often wrap output in a ```tsx fence, or add a stray sentence.
 * Pull out the code: the LARGEST fenced block if any (a small model sometimes
 * emits a one-line stray fence — a comment, a render call — before the real
 * component, so the first block isn't the code), else the whole text minus any
 * stray leading/trailing fence lines.
 */
export function extractCode(text: string): string {
  const blocks = [
    ...text.matchAll(/```(?:tsx?|jsx?|javascript|typescript)?\n([\s\S]*?)```/g),
  ].map((m) => m[1].trim());
  if (blocks.length > 0) {
    return blocks.reduce((a, b) => (b.length > a.length ? b : a));
  }
  return text.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
}
