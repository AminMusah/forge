"use client";

import * as React from "react";
import { ArrowUp } from "reicon-react";

import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (content: string) => void;
  autoFocus?: boolean;
}

export function ChatInput({ onSend, autoFocus }: ChatInputProps) {
  const [value, setValue] = React.useState("");

  const submit = () => {
    const content = value.trim();
    if (!content) return;
    onSend(content);
    setValue("");
  };

  return (
    <form
      className="w-full rounded-xl border bg-card shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        rows={3}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask anything..."
        className="w-full resize-none bg-transparent px-4 pt-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-end p-2">
        <Button
          type="submit"
          size="icon"
          aria-label="Send message"
          disabled={!value.trim()}
        >
          <ArrowUp />
        </Button>
      </div>
    </form>
  );
}
