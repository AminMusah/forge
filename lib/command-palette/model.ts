import type { Dtype } from "@/lib/model-cache";

/**
 * The model behind the command palette: FunctionGemma-270M, a specialist that
 * turns a sentence + tool schemas into one structured function call. It is NOT a
 * chat model, so it deliberately stays out of defaultModels (lib/models.ts) — it
 * would only clutter the chat picker and /models. The palette downloads it on
 * first use via preloadModel(), and it caches like any other browser model.
 *
 * fp16, never q4f16: q4f16 overflows on WebGPU for the Gemma-3-270M family and
 * returns garbage, and a routed command's structured output is far less forgiving
 * of numerical slop than casual chat.
 */
export const COMMAND_MODEL: { id: string; dtype: Dtype } = {
  id: "onnx-community/functiongemma-270m-it-ONNX",
  dtype: "fp16",
};
