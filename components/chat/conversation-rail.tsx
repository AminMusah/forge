"use client";

import * as React from "react";

import {
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

/**
 * Below this many prompts the thread is short enough to just scroll, so the
 * rail would be clutter. Matches how ChatGPT hides it on short threads.
 */
const MIN_TURNS = 3;

interface ConversationRailProps {
  messages: ChatMessage[];
}

/**
 * Right-gutter navigation rail for a conversation: one tick per user turn.
 * Hover previews the prompt; click jumps to it. Desktop only — the preview
 * needs hover (touch has none) and the gutter it sits in collapses on narrow
 * viewports anyway.
 *
 * Must be rendered inside <MessageScrollerProvider> (both hooks require it).
 */
export function ConversationRail({ messages }: ConversationRailProps) {
  const { scrollToMessage } = useMessageScroller();
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility();

  // The user turns ARE the scroll anchors (see message-list), so currentAnchorId
  // is always one of these ids.
  const anchors = React.useMemo(
    () => messages.filter((m) => m.role === "user"),
    [messages]
  );

  if (anchors.length < MIN_TURNS) return null;

  const visible = new Set(visibleMessageIds);

  return (
    <TooltipProvider delay={120}>
      <nav
        aria-label="Jump to a message"
        className="absolute inset-y-0 inset-e-3 z-10 hidden flex-col items-center justify-center gap-1.5 md:flex"
      >
        {anchors.map((m) => {
          const active = m.id === currentAnchorId;
          const preview = m.content.trim() || m.file?.name || "Attachment";
          return (
            <Tooltip key={m.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => scrollToMessage(m.id)}
                    aria-current={active ? "true" : undefined}
                    aria-label={`Jump to: ${preview}`}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-200",
                      active
                        ? "w-4 bg-foreground"
                        : visible.has(m.id)
                          ? "w-2.5 bg-muted-foreground/60 hover:bg-muted-foreground"
                          : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                    )}
                  />
                }
              />
              <TooltipContent side="left" className="max-w-xs">
                <span className="line-clamp-2 text-start">{preview}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
