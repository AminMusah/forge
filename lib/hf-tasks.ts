/**
 * Hugging Face task types — the Hub's `pipeline_tag` vocabulary, which is what
 * /models filters on and what the task-surface registry keys off.
 *
 * Mostly the transformers.js pipeline names, derived with:
 *
 *   Object.keys(tf)
 *     .filter((k) => k.endsWith("Pipeline") && k !== "Pipeline")
 *     .map((k) => k.replace(/Pipeline$/, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase())
 *
 * But NOT only those: `image-text-to-text` has no pipeline() at all — every
 * vision-language model needs its own model class, so the worker's generic
 * pipeline path can't drive one and Forge doesn't run this task today. This
 * list tracks what the HUB calls a task, not what transformers.js wraps.
 */
export const hfTasks = [
  "audio-classification",
  "automatic-speech-recognition",
  "background-removal",
  "depth-estimation",
  "document-question-answering",
  "feature-extraction",
  "fill-mask",
  "image-classification",
  "image-feature-extraction",
  "image-segmentation",
  "image-text-to-text",
  "image-to-image",
  "image-to-text",
  "object-detection",
  "question-answering",
  "summarization",
  "text-classification",
  "text-generation",
  "text-to-audio",
  "text2text-generation",
  "token-classification",
  "translation",
  "zero-shot-audio-classification",
  "zero-shot-classification",
  "zero-shot-image-classification",
  "zero-shot-object-detection",
] as const;

export type HfTask = (typeof hfTasks)[number];

/** "automatic-speech-recognition" → "Automatic Speech Recognition" */
export function taskLabel(task: string): string {
  return task
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
