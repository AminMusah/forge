"use client";

import * as React from "react";
import { ArrowUp, Bulb, Grid, Microphone, Plus } from "reicon-react";

import { ModelChip } from "@/components/chat/model-chip";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MAX_HEIGHT = 200;

/**
 * A composer control for a feature that doesn't exist yet. Uses aria-disabled
 * rather than `disabled` so it still reports what it will be — a disabled
 * button swallows the pointer events its tooltip needs.
 */
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
              "text-muted-foreground opacity-60 hover:bg-transparent hover:text-muted-foreground",
              className,
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label} — coming soon</TooltipContent>
    </Tooltip>
  );
}

interface ChatInputProps {
  onSend: (content: string) => void;
  autoFocus?: boolean;
}

export function ChatInput({ onSend, autoFocus }: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Grow with the content from a single line, then scroll internally.
  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const submit = () => {
    const content = value.trim();
    if (!content) return;
    onSend(content);
    setValue("");
  };

  return (
    <form
      className="w-full rounded-[18px] border bg-card p-3 shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"
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
          <ModelChip />
          <ComingSoon label="Voice input" className="size-8 px-0">
            <Microphone />
          </ComingSoon>
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={!value.trim()}
            className="size-9 rounded-lg"
          >
            <ArrowUp />
          </Button>
        </div>
      </div>
    </form>
  );
}
