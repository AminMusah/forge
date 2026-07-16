import type { HfTask } from "@/lib/hf-tasks";

/**
 * A task's I/O contract — the irreducible per-task-type cost of the playground.
 * DATA, not code: ~5 lines that replace a bespoke surface. It has two readers:
 * the worker's generic run() (which decodes the `input`) and the codegen agent
 * (which is handed `output` + `hint` to generate the renderer). Written ONCE per
 * task type; every model of that task reuses it untouched.
 */
export interface TaskDescriptor {
  /** The PRIMARY input — the worker decodes accordingly (image → RawImage). */
  input: "image" | "audio" | "text";
  /**
   * Overrides the default input instruction when the task isn't a plain single
   * input — e.g. zero-shot (also needs `labels`) or Q&A (also needs `context`).
   * It must tell the agent exactly what to collect and how to shape the
   * `forge.run({...})` call.
   */
  inputHint?: string;
  /** The native output shape, as a type signature — goes into the agent's prompt. */
  output: string;
  /** One sentence of art direction for the generated UI. */
  hint: string;
}

export const taskDescriptors: Partial<Record<HfTask, TaskDescriptor>> = {
  "automatic-speech-recognition": {
    input: "audio",
    output: "{ text: string }",
    hint: "Let the user drop or pick an audio file, show a running/loading state, then show the transcript with a copy button.",
  },
  "audio-classification": {
    input: "audio",
    output: "Array<{ label: string; score: number }>, highest score first.",
    hint: "Let the user drop or pick an audio file, then show the predicted labels as ranked horizontal bars with percentages.",
  },

  "zero-shot-audio-classification": {
    input: "audio",
    inputHint:
      "The user drops or picks an AUDIO file and types a comma-separated list of candidate labels. Read the audio with `FileReader.readAsDataURL` and split the labels into an array. Call `forge.run({ audio: dataUrl, labels: [...] })`.",
    output: "Array<{ label: string; score: number }>, best first.",
    hint: "Audio input plus a candidate-labels input, then the labels as ranked bars with percentages.",
  },

  "object-detection": {
    input: "image",
    output:
      "Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }> — the box coordinates are ABSOLUTE PIXELS in the ORIGINAL image resolution, NOT normalized 0..1.",
    hint: "Draw each box over the displayed image with its label and score. Because the coords are in original-image pixels, position boxes as a PERCENTAGE of the image's natural size (e.g. left = box.xmin / naturalWidth * 100%), so they track the image at any display size. Add a score-threshold slider.",
  },

  "image-classification": {
    input: "image",
    output:
      "Array<{ label: string; score: number }>, sorted highest score first.",
    hint: "Show the image, then the predictions as a ranked list of horizontal bars — bar width proportional to score, with the label and a percentage. Add a slider for how many top results to show.",
  },

  "image-to-text": {
    input: "image",
    output: "Array<{ generated_text: string }> (usually one item).",
    hint: "Show the image and, below it, the generated caption as prominent text with a copy button.",
  },

  "image-segmentation": {
    input: "image",
    output:
      "Array<{ label: string; score: number; mask: { data: Uint8ClampedArray; width: number; height: number } }> — each mask is a single-channel image the size of the input; a pixel value near 255 means it belongs to that segment.",
    hint: "Show the image with each segment's mask overlaid as a translucent colored layer (one color per label), drawn onto a <canvas>. List the labels with a toggle to show/hide each. Paint a mask by drawing its data to a canvas and using the value as alpha.",
  },

  "text-classification": {
    input: "text",
    output: "Array<{ label: string; score: number }>, highest score first.",
    hint: "A textarea to enter text, then the predicted labels as ranked horizontal bars with percentages (e.g. sentiment). Run on submit.",
  },

  "token-classification": {
    input: "text",
    output:
      "Array<{ word: string; entity: string; score: number; start: number; end: number }> — one entry per detected token span (e.g. named entities).",
    hint: "A textarea, then render the input text with each detected span highlighted (a colored background per entity type) and the entity label shown on hover or inline. Include a legend of entity types.",
  },

  "fill-mask": {
    input: "text",
    output:
      "Array<{ token_str: string; score: number; sequence: string }>, best first.",
    hint: "A text input (instruct the user to include the model's mask token, e.g. [MASK]). Show the top predicted fillers as a ranked list with scores, and the full completed sentence for the top pick.",
  },

  "summarization": {
    input: "text",
    output: "Array<{ summary_text: string }> (one item).",
    hint: "A large textarea for the source text, a Summarize button, then the summary shown as clean prose with a copy button.",
  },

  "translation": {
    input: "text",
    output: "Array<{ translation_text: string }> (one item).",
    hint: "A textarea for the source text and the translation shown below it with a copy button. (The model has a fixed language pair; don't add language pickers.)",
  },

  "text2text-generation": {
    input: "text",
    output: "Array<{ generated_text: string }> (one item).",
    hint: "A textarea for the prompt/instruction and the generated output shown below with a copy button.",
  },

  "zero-shot-classification": {
    input: "text",
    inputHint:
      "The user types TEXT in a textarea AND a comma-separated list of candidate labels. Split the labels into an array. Call `forge.run({ text, labels: ['label a', 'label b', ...] })`.",
    output:
      "{ sequence: string; labels: string[]; scores: number[] } — `labels` and `scores` are aligned and already sorted best-first.",
    hint: "A textarea for the text and an input for candidate labels. Show each label with its score as a ranked horizontal bar.",
  },

  "zero-shot-image-classification": {
    input: "image",
    inputHint:
      "The user drops or picks an IMAGE and types a comma-separated list of candidate labels. Read the image with `FileReader.readAsDataURL` and split the labels into an array. Call `forge.run({ image: dataUrl, labels: [...] })`.",
    output: "Array<{ label: string; score: number }>, best first.",
    hint: "Image input plus a candidate-labels input. Show the image, then the labels as ranked bars with percentages.",
  },

  "zero-shot-object-detection": {
    input: "image",
    inputHint:
      "The user drops or picks an IMAGE and types a comma-separated list of candidate object labels. Read the image as a data URL and split the labels. Call `forge.run({ image: dataUrl, labels: [...] })`.",
    output:
      "Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }> — box coordinates are ABSOLUTE PIXELS in the original image resolution.",
    hint: "Draw each detected box over the displayed image (position boxes as a PERCENTAGE of the image's natural size), with its label and score. Add a candidate-labels input and a score-threshold slider.",
  },

  "question-answering": {
    input: "text",
    inputHint:
      "The user fills TWO text fields: a QUESTION and a CONTEXT passage to answer from. Call `forge.run({ text: question, context: context })`.",
    output: "{ answer: string; score: number; start: number; end: number }",
    hint: "A field for the question and a larger textarea for the context. Show the answer prominently with its confidence, and optionally highlight the answer span within the context.",
  },

  "document-question-answering": {
    input: "image",
    inputHint:
      "The user drops or picks an IMAGE of a document AND types a QUESTION. Read the image as a data URL. Call `forge.run({ image: dataUrl, text: question })`.",
    output: "Array<{ answer: string }> (usually one item).",
    hint: "Show the document image and a question field; display the answer as prominent text with a copy button.",
  },

  "background-removal": {
    input: "image",
    output:
      "An array with one image: [{ data: Uint8ClampedArray; width: number; height: number; channels: number }] — the cutout, RGBA (channels 4) where alpha marks the kept foreground.",
    hint: "Draw the returned image onto a <canvas> the SAME width/height as its data — build `new ImageData(new Uint8ClampedArray(result[0].data), result[0].width, result[0].height)` and putImageData. Show it over a checkerboard background so transparency reads, and offer a Download (canvas.toDataURL('image/png')).",
  },

  "image-to-image": {
    input: "image",
    output:
      "A single image: { data: Uint8ClampedArray; width: number; height: number; channels: number } (e.g. an upscaled result). If channels is 3, expand to RGBA before drawing.",
    hint: "Show the input and the output images side by side. Draw the output via ImageData onto a <canvas> at its own width/height, and offer a PNG download.",
  },

  "text-to-audio": {
    input: "text",
    output:
      "{ audio: Float32Array; sampling_rate: number } — raw mono PCM samples in [-1, 1].",
    hint: "A textarea and a Generate button. Encode the returned samples as a 16-bit PCM WAV Blob (write a 44-byte WAV header + Int16 samples at sampling_rate), make an object URL, and offer an <audio controls> player plus a download. Note: some voices may need a speaker embedding and can error — show the error clearly if so.",
  },
};

export function descriptorFor(task: HfTask): TaskDescriptor | undefined {
  return taskDescriptors[task];
}
