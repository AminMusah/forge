/**
 * Task types supported by transformers.js pipelines.
 *
 * Hand-derived from @huggingface/transformers v3 (the library is not a
 * dependency yet — install it when inference lands). Recipe to regenerate:
 *
 *   Object.keys(tf)
 *     .filter((k) => k.endsWith("Pipeline") && k !== "Pipeline")
 *     .map((k) => k.replace(/Pipeline$/, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase())
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
