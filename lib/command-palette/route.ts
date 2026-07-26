import { request } from "@/lib/worker-client";
import { COMMAND_MODEL } from "@/lib/command-palette/model";
import { toolSpecs } from "@/lib/command-palette/tool-specs";
import { parseToolCall, type ParsedCall } from "@/lib/command-palette/parse-tool-call";

/**
 * Route a natural-language command through FunctionGemma to a structured call.
 *
 * The worker's load() downloads and compiles the model on first use, so its
 * progress ("Downloading weights… N%") flows through `onProgress` — no separate
 * preload. Returns the parsed call plus the raw model turn, so a miss (call ===
 * null) is inspectable rather than silent.
 */
export async function routeCommand(
  text: string,
  onProgress?: (status: string) => void
): Promise<{ call: ParsedCall | null; raw: string }> {
  const { data } = await request(
    {
      type: "route",
      modelId: COMMAND_MODEL.id,
      dtype: COMMAND_MODEL.dtype,
      messages: [{ role: "user", content: text }],
      tools: toolSpecs,
    },
    { onProgress }
  );
  const raw = (data as { text?: string } | undefined)?.text ?? "";
  return { call: parseToolCall(raw), raw };
}
