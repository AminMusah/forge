/**
 * The tools the command palette exposes to FunctionGemma — pure JSON-schema data,
 * handed to the tokenizer's chat template as the `tools` list. The model reads
 * ONLY this (a name, a description, and typed parameters) to decide which call to
 * emit; the matching runnable behaviour lives in useToolHandlers(). Keep the two
 * in lockstep: every name here needs a handler there.
 *
 * v1 is deliberately non-destructive — each maps to a function that already
 * exists (preloadModel, useOpenModel, createEmptyChat, router.push, setTheme).
 */
export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/** The tool names the palette knows how to run — the source of truth for both
 *  the specs below and the handler map. */
export type ToolName =
  | "download_model"
  | "open_model_in_chat"
  | "new_chat"
  | "navigate"
  | "set_theme";

export const toolSpecs: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "download_model",
      description:
        "Download a model's weights to the user's device so it can run in the browser on their GPU.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              "The Hugging Face model id, e.g. 'onnx-community/Qwen2.5-Coder-1.5B'.",
          },
          dtype: {
            type: "string",
            enum: ["q4", "fp16", "q4f16", "q8"],
            description: "Quantization to download. Defaults to q4.",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_model_in_chat",
      description:
        "Open a text-generation model in a new chat so the user can talk to it.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The Hugging Face model id to open in chat.",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "new_chat",
      description: "Start a fresh, empty chat with the currently selected model.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Go to one of the app's main pages.",
      parameters: {
        type: "object",
        properties: {
          destination: {
            type: "string",
            enum: ["models", "downloaded", "playground", "home"],
            description:
              "Which page to open: the model catalog, downloaded models, the playground, or the home screen.",
          },
        },
        required: ["destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_theme",
      description: "Switch the app's colour theme.",
      parameters: {
        type: "object",
        properties: {
          theme: {
            type: "string",
            enum: ["dark", "light", "system"],
            description: "The theme to apply.",
          },
        },
        required: ["theme"],
      },
    },
  },
];
