"use client";

import * as React from "react";
import { ArrowUp, Bulb, Grid, Microphone, Plus, Stop } from "reicon-react";

import { ModelChip } from "@/components/chat/model-chip";
import { Button } from "@/components/ui/button";
import { IconSwap } from "@/components/ui/icon-swap";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCanDictate, useDictation } from "@/hooks/use-dictation";
import type { HfTask } from "@/lib/hf-tasks";
import { cn } from "@/lib/utils";

const MAX_HEIGHT = 200;

/**
 * A composer control that can't do its job — either because it doesn't exist
 * yet, or because this browser can't run it. Uses aria-disabled rather than
 * `disabled` so it still reports WHY: a disabled button swallows the pointer
 * events its tooltip needs.
 */
function Unavailable({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-disabled
            onClick={(event) => event.preventDefault()}
            className={cn(
              // No press feedback: these controls do nothing, so they must not
              // pretend to respond to being pressed.
              "cursor-default text-muted-foreground opacity-60 hover:bg-transparent hover:text-muted-foreground active:translate-y-0",
              className,
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** A control for a feature that doesn't exist yet. */
function ComingSoon({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Unavailable label={`${label} — coming soon`} className={className}>
      {children}
    </Unavailable>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

interface ChatInputProps {
  onSend: (content: string) => void;
  autoFocus?: boolean;
  /** True while a reply is streaming — the send button becomes a stop button. */
  isStreaming?: boolean;
  onStop?: () => void;
  /**
   * Restrict the model menu to this task. An open chat passes its own, so it
   * can't be re-pinned to a model whose surface can't render it; the home
   * screen passes nothing, because switching task there is how you get to
   * another surface.
   */
  task?: HfTask;
}

export function ChatInput({
  onSend,
  autoFocus,
  isStreaming = false,
  onStop,
  task,
}: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Dictation APPENDS: the realistic flow is to type half a thought, speak the
  // rest, then fix a word by hand. Replacing what's there would destroy typed
  // work with no undo.
  const dictation = useDictation((text) => {
    setValue((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    textareaRef.current?.focus();
  });
  const canDictate = useCanDictate();
  const isRecording = dictation.status === "recording";

  // Grow with the content from a single line, then scroll internally.
  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const submit = () => {
    if (isStreaming) {
      onStop?.();
      return;
    }
    const content = value.trim();
    if (!content) return;
    onSend(content);
    setValue("");
  };

  // The focus ring keys off the textarea rather than focus-within, so clicking
  // the model pill or a toolbar button doesn't light the composer.
  return (
    <form
      className="w-full rounded-[18px] border bg-card p-3 shadow-xs transition-[border-color,box-shadow] duration-150 ease-out has-[textarea:focus]:border-ring has-[textarea:focus]:ring-2 has-[textarea:focus]:ring-ring/30"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask anything…"
        className="w-full resize-none bg-transparent px-1 pt-1 pb-4 text-[15px] outline-none placeholder:text-muted-foreground"
      />

      {dictation.status !== "idle" && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 px-1 pb-3 text-xs text-muted-foreground"
        >
          {isRecording ? (
            <>
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
              <span>Listening… {formatElapsed(dictation.seconds)}</span>
              <span className="text-muted-foreground/60">Esc to cancel</span>
            </>
          ) : (
            <>
              <Spinner className="size-3 shrink-0" />
              {/* While the weights are still coming down, say so — a bare
                  "Transcribing…" that hangs for a minute looks broken. */}
              <span>{dictation.progress ?? "Transcribing…"}</span>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <ComingSoon label="Attach files" className="size-8 px-0">
          <Plus />
        </ComingSoon>
        <ComingSoon label="Tools" className="size-8 px-0">
          <Grid />
        </ComingSoon>
        <ComingSoon label="Reasoning" className="gap-1.5 px-3">
          <Bulb />
          <span className="text-xs">Reasoning</span>
        </ComingSoon>

        <div className="ml-auto flex items-center gap-1.5">
          <ModelChip task={task} />
          {canDictate ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-disabled={dictation.status === "transcribing"}
                    aria-label={isRecording ? "Stop recording" : "Voice input"}
                    onClick={() => {
                      if (dictation.status === "transcribing") return;
                      if (isRecording) void dictation.stop();
                      else void dictation.start();
                    }}
                    className={cn(
                      "size-8 px-0",
                      isRecording && "text-destructive hover:text-destructive",
                      dictation.status === "transcribing" &&
                        "cursor-default text-muted-foreground opacity-60 hover:bg-transparent active:translate-y-0",
                    )}
                  />
                }
              >
                {dictation.status === "transcribing" ? (
                  <Spinner />
                ) : (
                  <IconSwap
                    showing={isRecording}
                    on={<Stop />}
                    off={<Microphone />}
                  />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {dictation.status === "transcribing"
                  ? "Transcribing…"
                  : isRecording
                    ? "Stop and transcribe"
                    : "Voice input — runs on your device"}
              </TooltipContent>
            </Tooltip>
          ) : (
            // Same idiom as the unbuilt controls: a button that can't do its
            // job still has to say why.
            <Unavailable
              label="Voice input needs WebGPU — try Chrome or Edge"
              className="size-8 px-0"
            >
              <Microphone />
            </Unavailable>
          )}
          <Button
            type="submit"
            size="icon"
            aria-label={isStreaming ? "Stop generating" : "Send message"}
            disabled={!isStreaming && !value.trim()}
            className="size-9 rounded-lg"
          >
            <IconSwap showing={isStreaming} on={<Stop />} off={<ArrowUp />} />
          </Button>
        </div>
      </div>
    </form>
  );
}
