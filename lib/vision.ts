/**
 * What to ask a vision-language model to do with an image.
 *
 * Florence-2's design is that a TASK TOKEN in the prompt selects the job — the
 * same weights caption, describe, or read text depending on the token. So the
 * "prompt" for an image turn isn't free text; it's one of these.
 *
 * Object detection (<OD>) is deliberately absent: it returns boxes, not text,
 * and needs an overlay on the image rather than a reply. That's its own feature.
 */
export const visionTasks = [
  {
    token: "<CAPTION>",
    label: "Caption",
    description: "A one-line description",
  },
  {
    token: "<DETAILED_CAPTION>",
    label: "Detailed caption",
    description: "A paragraph describing the scene",
  },
  {
    token: "<OCR>",
    label: "Read text",
    description: "Transcribe the text in the image",
  },
] as const;

export type VisionToken = (typeof visionTasks)[number]["token"];

export const DEFAULT_VISION_TOKEN: VisionToken = "<CAPTION>";

/** "<DETAILED_CAPTION>" → "Detailed caption", for a row that shows what was asked. */
export function visionLabel(token: string): string {
  return visionTasks.find((t) => t.token === token)?.label ?? "Caption";
}

export function isVisionToken(value: string): value is VisionToken {
  return visionTasks.some((t) => t.token === value);
}

/**
 * Which vision models Forge can actually run.
 *
 * There is no pipeline() for image-text-to-text, so every model is driven by
 * hand — and Florence-2's way of being driven (a task token, expanded by its own
 * processor, post-processed back into an answer) is NOT how the others work.
 * SmolVLM and LLaVA take a chat template and a free-text question instead, which
 * is a different worker branch and a different composer.
 *
 * The Hub will happily offer those models; we must not pretend we can run them.
 */
export function isSupportedVisionModel(modelId: string): boolean {
  return modelId.includes("Florence-2");
}
