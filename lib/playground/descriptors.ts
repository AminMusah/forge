import type { HfTask } from "@/lib/hf-tasks";

/**
 * A task's I/O contract — the irreducible per-task-type cost of the playground.
 * DATA, not code: ~5 lines that replace a bespoke surface. It has two readers:
 * the worker's generic run() (which decodes the `input`) and the codegen agent
 * (which is handed `output` + `hint` to generate the renderer). Written ONCE per
 * task type; every model of that task reuses it untouched.
 */
export interface TaskDescriptor {
  /** How the model is fed. The worker decodes accordingly (image → RawImage). */
  input: "image" | "audio" | "text";
  /** The native output shape, as a type signature — goes into the agent's prompt. */
  output: string;
  /** One sentence of art direction for the generated UI. */
  hint: string;
}

export const taskDescriptors: Partial<Record<HfTask, TaskDescriptor>> = {
  "object-detection": {
    input: "image",
    output:
      "Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>",
    hint: "Draw each box over the image with its label and score; add a score-threshold slider.",
  },
};

export function descriptorFor(task: HfTask): TaskDescriptor | undefined {
  return taskDescriptors[task];
}
