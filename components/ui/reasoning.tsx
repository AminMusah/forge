"use client";

import * as React from "react";
import { ChevronRight } from "reicon-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface ReasoningContextValue {
  isStreaming: boolean;
  duration: number | null;
}

const ReasoningContext = React.createContext<ReasoningContextValue>({
  isStreaming: false,
  duration: null,
});

interface ReasoningProps extends React.ComponentProps<"div"> {
  /** True while the model is still emitting chain-of-thought. */
  isStreaming?: boolean;
  /** Open while streaming, collapse when done (uncontrolled otherwise). */
  defaultOpen?: boolean;
}

/**
 * Collapsible chain-of-thought panel: auto-opens while the model reasons,
 * auto-collapses once it starts answering, and reports how long it thought.
 */
function Reasoning({
  className,
  isStreaming = false,
  defaultOpen = false,
  children,
  ...props
}: ReasoningProps) {
  const [open, setOpen] = React.useState(defaultOpen || isStreaming);
  // Null until reasoning ends; measured from the first streaming render.
  const [duration, setDuration] = React.useState<number | null>(null);
  const startedAt = React.useRef<number | null>(null);
  // Only auto-collapse the panel we auto-opened, not one the user opened.
  const autoOpened = React.useRef(false);

  React.useEffect(() => {
    if (isStreaming) {
      startedAt.current ??= Date.now();
      setOpen((prev) => {
        if (!prev) autoOpened.current = true;
        return true;
      });
      return;
    }
    if (startedAt.current !== null && duration === null) {
      setDuration(Math.round((Date.now() - startedAt.current) / 1000));
      if (autoOpened.current) setOpen(false);
    }
  }, [isStreaming, duration]);

  return (
    <ReasoningContext.Provider value={{ isStreaming, duration }}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className={cn("group/reasoning w-full", className)}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

function ReasoningTrigger({
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
  const { isStreaming, duration } = React.useContext(ReasoningContext);

  return (
    <CollapsibleTrigger
      className={cn(
        "w-full cursor-pointer text-left hover:text-foreground",
        className
      )}
      {...props}
    >
      <Marker>
        <MarkerIcon>
          {isStreaming ? (
            <Spinner />
          ) : (
            <ChevronRight className="transition-transform duration-200 group-data-open/reasoning:rotate-90" />
          )}
        </MarkerIcon>
        <MarkerContent className={cn(isStreaming && "animate-pulse")}>
          {isStreaming
            ? "Thinking…"
            : duration !== null
              ? `Thought for ${duration}s`
              : "Thought process"}
        </MarkerContent>
      </Marker>
    </CollapsibleTrigger>
  );
}

function ReasoningContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent {...props}>
      <div
        className={cn(
          "mt-2 border-l-2 border-border pl-3 text-xs/relaxed whitespace-pre-wrap text-muted-foreground",
          className
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

export { Reasoning, ReasoningTrigger, ReasoningContent };
