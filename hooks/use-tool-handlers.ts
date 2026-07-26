"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { useOpenModel } from "@/hooks/use-open-model";
import { preloadModel } from "@/lib/browser-transport";
import { DEFAULT_DTYPE, type Dtype } from "@/lib/model-cache";
import type { ParsedCall } from "@/lib/command-palette/parse-tool-call";

/** The confirm chip's two lines: what will happen, and to what. */
export interface ToolDescription {
  title: string;
  detail?: string;
}

const DESTINATIONS: Record<string, string> = {
  models: "/models",
  downloaded: "/models/downloaded",
  playground: "/p",
  home: "/",
};

/**
 * Turns a parsed FunctionGemma call into a human sentence (for the confirm chip)
 * and a runnable action. Every branch is a thin wrapper over something that
 * already exists — preloadModel, useOpenModel, createEmptyChat, router.push,
 * setTheme — so the model only ever chooses; the capability is Forge's.
 */
export function useToolHandlers() {
  const router = useRouter();
  const openModel = useOpenModel();
  const { setTheme } = useTheme();
  const models = useModelStore((s) => s.models);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const createEmptyChat = useChatStore((s) => s.createEmptyChat);

  const describe = React.useCallback(
    (call: ParsedCall): ToolDescription => {
      const a = call.arguments;
      switch (call.name) {
        case "download_model":
          return {
            title: "Download model",
            detail: `${a.id ?? "—"}${a.dtype ? ` · ${a.dtype}` : ""}`,
          };
        case "open_model_in_chat":
          return { title: "Open model in chat", detail: String(a.id ?? "—") };
        case "new_chat":
          return { title: "Start a new chat", detail: selectedModel.name };
        case "navigate":
          return { title: "Go to", detail: String(a.destination ?? "—") };
        case "set_theme":
          return { title: "Switch theme", detail: String(a.theme ?? "—") };
        default:
          return { title: "Unknown command", detail: call.name };
      }
    },
    [selectedModel.name]
  );

  const run = React.useCallback(
    async (call: ParsedCall): Promise<void> => {
      const a = call.arguments;
      switch (call.name) {
        case "download_model": {
          const id = String(a.id ?? "").trim();
          if (!id) throw new Error("No model id was given.");
          // A known model carries its task and its own default quant; an unknown
          // id we can only assume is a text generator at the safe default.
          const known = models.find((m) => m.id === id);
          const dtype = (a.dtype as Dtype) || known?.dtype || DEFAULT_DTYPE;
          await preloadModel(id, dtype, undefined, known?.task ?? "text-generation");
          toast.success(`${known?.name ?? id} ready`, {
            description: "It runs on your GPU — no token, no credits.",
          });
          return;
        }
        case "open_model_in_chat": {
          const id = String(a.id ?? "").trim();
          const model = models.find((m) => m.id === id);
          if (!model) {
            throw new Error(
              "That model isn't in your catalog yet — search for it on the Models page first."
            );
          }
          openModel(model);
          return;
        }
        case "new_chat": {
          // Reuse an existing empty chat for this model so repeated commands don't
          // pile up blanks — the same rule useOpenModel follows.
          const existing = useChatStore
            .getState()
            .chats.find(
              (c) => c.modelId === selectedModel.id && c.messages.length === 0
            );
          router.push(`/c/${existing?.id ?? createEmptyChat(selectedModel.id)}`);
          return;
        }
        case "navigate": {
          const path = DESTINATIONS[String(a.destination ?? "")];
          if (!path) throw new Error(`Nowhere called "${a.destination}".`);
          router.push(path);
          return;
        }
        case "set_theme": {
          const theme = String(a.theme ?? "");
          if (!["dark", "light", "system"].includes(theme)) {
            throw new Error(`No theme called "${theme}".`);
          }
          setTheme(theme);
          return;
        }
        default:
          throw new Error(`Forge can't run "${call.name}".`);
      }
    },
    [models, selectedModel.id, openModel, createEmptyChat, router, setTheme]
  );

  return { describe, run };
}
