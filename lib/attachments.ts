import type { MessageFile } from "@/lib/types";

/**
 * Reading an attached file into text a chat model can actually see.
 *
 * Every model the chat surface can reach is text-generation (ChatView pins the
 * composer to it), so an attachment is never handed to a model AS a file — it's
 * extracted here and inlined into the prompt. That's what lets one code path
 * serve BYO, Ollama and WebGPU models alike: none of them ever learn a file was
 * involved. The cost is that we can only accept what the browser can read as
 * text; PDF would slot in behind `extract` as its own branch.
 */

/**
 * Extensions we can read with file.text(). Extension, NOT mediaType: the browser
 * reports .ts as "video/mp2t" and .md as "" on most platforms, so filtering by
 * type would reject the source files this is mostly for and trust little else.
 */
const textExtensions = [
  "txt",
  "md",
  "mdx",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "yaml",
  "yml",
  "toml",
  "xml",
  "html",
  "css",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "rb",
  "rs",
  "go",
  "java",
  "c",
  "h",
  "cpp",
  "cs",
  "sh",
  "sql",
  "log",
  "env",
];

/** For the file input, so the OS picker greys out what we'd only reject. */
export const attachAccept = textExtensions.map((ext) => `.${ext}`).join(",");

/**
 * Cap on EXTRACTED characters, not file bytes — the two diverge, and bytes would
 * reject files that read fine. Roughly 25k tokens: past what most Ollama defaults
 * and every browser model can hold, so this bounds the model's context as much as
 * it bounds localStorage (extractions persist with the chat).
 */
export const MAX_ATTACHMENT_CHARS = 100_000;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** "12 KB" — sized by extracted text, which is what the model receives. */
export function formatTextSize(text: string): string {
  const kb = text.length / 1024;
  return kb < 1 ? `${text.length} B` : `${Math.round(kb)} KB`;
}

export type ExtractResult =
  | { file: MessageFile; error?: never }
  | { file?: never; error: string };

/** Reads a file into a MessageFile, or explains why it can't. */
export async function extract(file: File): Promise<ExtractResult> {
  if (!textExtensions.includes(extensionOf(file.name))) {
    return { error: `Can't read ${file.name} — only text files for now.` };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { error: `Couldn't read ${file.name}.` };
  }

  if (!text.trim()) return { error: `${file.name} is empty.` };
  if (text.length > MAX_ATTACHMENT_CHARS) {
    return {
      error: `${file.name} is too long (${formatTextSize(text)}) — the limit is ${
        MAX_ATTACHMENT_CHARS / 1000
      }k characters.`,
    };
  }

  return {
    // mediaType records what the browser CLAIMED, not what we inferred from the
    // extension — a stored fact shouldn't be our guess.
    file: { name: file.name, mediaType: file.type, text },
  };
}

/**
 * The single text part a model sees for a turn with an attachment. The file goes
 * first and the question last: models follow a trailing instruction far more
 * reliably than one buried above 20k tokens of context.
 */
export function composeWithFile(content: string, file: MessageFile): string {
  return `<file name="${file.name}">\n${file.text}\n</file>\n\n${content}`;
}
