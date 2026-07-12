"use client";

import { ChatInput } from "@/components/chat/chat-input";
import { useModelStore } from "@/hooks/use-model-store";

interface ChatPlaceholderProps {
  title?: string;
}

export function ChatPlaceholder({ title }: ChatPlaceholderProps) {
  const selectedModel = useModelStore((state) => state.selectedModel);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {title ?? "How can I help you today?"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {title
            ? "This conversation is a placeholder — messages coming soon."
            : `Chatting with ${selectedModel.name}`}
        </p>
      </div>
      <div className="w-full max-w-2xl">
        <ChatInput />
      </div>
    </div>
  );
}
