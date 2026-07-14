import * as React from "react";

import { cn } from "@/lib/utils";

interface IconSwapProps {
  /** Which icon is showing. */
  showing: boolean;
  on: React.ReactNode;
  off: React.ReactNode;
  className?: string;
}

/**
 * Crossfades between two icons in a fixed box. An instant glyph swap reads as
 * a glitch — the fade is what tells you the state actually changed.
 */
export function IconSwap({ showing, on, off, className }: IconSwapProps) {
  return (
    <span
      className={cn("relative grid size-4 place-items-center", className)}
      aria-hidden="true"
    >
      <span
        className={cn(
          "col-start-1 row-start-1 flex transition-[opacity,transform] duration-150 ease-out",
          showing ? "scale-100 opacity-100" : "scale-90 opacity-0"
        )}
      >
        {on}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 flex transition-[opacity,transform] duration-150 ease-out",
          showing ? "scale-90 opacity-0" : "scale-100 opacity-100"
        )}
      >
        {off}
      </span>
    </span>
  );
}
