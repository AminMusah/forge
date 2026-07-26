/**
 * Parses FunctionGemma's tool-call output into a plain object.
 *
 * The model does NOT emit JSON. Its call is Gemma's own DSL, fenced by special
 * tokens (confirmed by rendering the model's real chat_template):
 *
 *   <start_function_call>call:download_model{dtype:<escape>fp16<escape>,id:<escape>Qwen<escape>}<end_function_call>
 *
 * — `call:NAME{key:value,…}`, keys sorted, STRING values fenced by <escape>
 * tokens, scalars bare. The worker decodes with special tokens KEPT, so those
 * delimiters survive for us to slice on.
 */

export interface ParsedCall {
  name: string;
  arguments: Record<string, string | number | boolean>;
}

export function parseToolCall(text: string): ParsedCall | null {
  const match = text.match(
    /<start_function_call>call:([^{]+)\{([\s\S]*?)\}<end_function_call>/
  );
  if (!match) return null;

  const name = match[1].trim();
  const args: Record<string, string | number | boolean> = {};
  for (const pair of splitTopLevel(match[2])) {
    const i = pair.indexOf(":");
    if (i === -1) continue;
    args[pair.slice(0, i)] = parseValue(pair.slice(i + 1));
  }
  return { name, arguments: args };
}

function parseValue(v: string): string | number | boolean {
  const str = v.match(/^<escape>([\s\S]*)<escape>$/);
  if (str) return str[1];
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

/**
 * Split a call body on top-level commas. Strings are fenced by <escape> markers,
 * so a comma inside one (or inside a nested object/array) is not a separator.
 */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let buf = "";
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith("<escape>", i)) {
      inStr = !inStr;
      buf += "<escape>";
      i += 7;
      continue;
    }
    const c = body[i];
    if (!inStr && (c === "{" || c === "[")) depth++;
    if (!inStr && (c === "}" || c === "]")) depth--;
    if (!inStr && c === "," && depth === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  if (buf) parts.push(buf);
  return parts;
}
