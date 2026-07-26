"use client";

import * as React from "react";
import { Check, Sparkles, Xmark } from "reicon-react";
import { ThinkingOrb } from "thinking-orbs";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCommandPaletteStore } from "@/hooks/use-command-palette-store";
import { useToolHandlers, type ToolDescription } from "@/hooks/use-tool-handlers";
import { routeCommand } from "@/lib/command-palette/route";
import type { ParsedCall } from "@/lib/command-palette/parse-tool-call";

type Phase = "idle" | "routing" | "proposed" | "running";

interface Proposed {
  call: ParsedCall;
  desc: ToolDescription;
}

/**
 * Type a sentence, an on-device model turns it into one of Forge's actions. The
 * model only ever CHOOSES the action (and its arguments) — every command lands on
 * a confirm chip first, so a misfire is a click away from being cancelled, and
 * the parse is visible before anything runs.
 */
export function CommandPalette() {
  const { isOpen, open, close } = useCommandPaletteStore();
  const { describe, run } = useToolHandlers();

  const [input, setInput] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [status, setStatus] = React.useState<string | null>(null);
  const [proposed, setProposed] = React.useState<Proposed | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Global ⌘K / Ctrl+K opens the palette from anywhere in the app.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset to a clean slate whenever the palette closes, so it never reopens
  // mid-flow with a stale proposal or error.
  React.useEffect(() => {
    if (isOpen) return;
    setInput("");
    setPhase("idle");
    setStatus(null);
    setProposed(null);
    setError(null);
  }, [isOpen]);

  const submit = async () => {
    const text = input.trim();
    if (!text || phase === "routing") return;
    setError(null);
    setStatus(null);
    setPhase("routing");
    try {
      const { call, raw } = await routeCommand(text, setStatus);
      if (!call) {
        // The model answered but not with a call we could parse — surface it and
        // leave the raw turn in the console for debugging the route path.
        console.debug("[command-palette] unparsed model output:", raw);
        setError("Couldn't turn that into an action. Try rephrasing.");
        setPhase("idle");
        return;
      }
      setProposed({ call, desc: describe(call) });
      setPhase("proposed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("idle");
    } finally {
      setStatus(null);
    }
  };

  const confirm = async () => {
    if (!proposed) return;
    setError(null);
    setPhase("running");
    try {
      await run(proposed.call);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That action failed.");
      setPhase("proposed");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && close()}>
      <DialogContent
        className="top-1/4 gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Type what you want and an on-device model turns it into an action.
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-12 items-center gap-2 border-b px-4">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={phase === "routing" || phase === "running"}
            placeholder="Try: download qwen coder in fp16"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
        </div>

        <div className="p-3">
          {phase === "routing" && (
            <div className="flex items-center gap-2.5 px-1 py-2 text-sm text-muted-foreground">
              <ThinkingOrb state="working" size={20} aria-hidden />
              <span>{status ?? "Interpreting…"}</span>
            </div>
          )}

          {phase === "proposed" && proposed && (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {proposed.desc.title}
                </p>
                {proposed.desc.detail && (
                  <p className="truncate text-sm">{proposed.desc.detail}</p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={close}>
                <Xmark className="size-3.5" />
                Cancel
              </Button>
              <Button size="sm" onClick={() => void confirm()}>
                <Check className="size-3.5" />
                Run
              </Button>
            </div>
          )}

          {phase === "running" && (
            <div className="flex items-center gap-2.5 px-1 py-2 text-sm text-muted-foreground">
              <ThinkingOrb state="solving" size={20} aria-hidden />
              <span>Running…</span>
            </div>
          )}

          {phase === "idle" && !error && (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              Runs on your GPU. Download a model, open one in chat, jump to a page,
              or switch theme — just say it.
            </p>
          )}

          {error && (
            <p className="px-1 py-2 text-xs text-destructive">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
