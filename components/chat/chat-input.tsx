"use client";

import { ArrowUp } from "reicon-react";

import { Button } from "@/components/ui/button";

export function ChatInput() {
  return (
    <form
      className="w-full rounded-xl border bg-card shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"
      onSubmit={(e) => e.preventDefault()}
    >
      <textarea
        rows={3}
        placeholder="Ask anything..."
        className="w-full resize-none bg-transparent px-4 pt-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-end p-2">
        <Button type="submit" size="icon" aria-label="Send message">
          <ArrowUp />
        </Button>
      </div>
    </form>
  );
}
