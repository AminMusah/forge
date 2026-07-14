"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AudioDropzone } from "@/components/chat/audio-dropzone";
import { ChatInput } from "@/components/chat/chat-input";
import { ModelChip } from "@/components/chat/model-chip";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { startConversation, startTranscription } from "@/lib/conversation";

export function ChatPlaceholder() {
  const router = useRouter();
  const hasHydrated = useChatStore((state) => state.hasHydrated);
  const selectedModel = useModelStore((state) => state.selectedModel);
  const [starting, setStarting] = React.useState(false);

  const isTranscription =
    selectedModel.task === "automatic-speech-recognition";

  // A chat created before rehydration would be overwritten by the stored chats a
  // moment later. Hydration is a mount effect so this is all but impossible, but
  // flush it first rather than risk dropping the message.
  const flush = () => {
    if (!hasHydrated) void useChatStore.persist.rehydrate();
  };

  const handleSend = (content: string) => {
    flush();
    router.push(`/c/${startConversation(content, selectedModel.id)}`);
  };

  const handleFile = async (file: File) => {
    flush();
    setStarting(true);
    try {
      // Reading the file is the only async step — the transcription itself runs
      // on the surface we're about to navigate to.
      router.push(`/c/${await startTranscription(file, selectedModel.id)}`);
    } catch (error) {
      setStarting(false);
      toast.error("Couldn't read that file", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isTranscription
            ? "What should I transcribe?"
            : "How can I help you today?"}
        </h1>
      </div>

      <div className="w-full max-w-2xl">
        {isTranscription ? (
          <div className="flex flex-col items-center gap-3">
            <AudioDropzone
              onFile={(file) => void handleFile(file)}
              busy={starting}
              hint={
                selectedModel.runtime === "browser"
                  ? "Runs on your GPU — the audio never leaves your machine"
                  : "Sent to Hugging Face for transcription"
              }
            />
            {/* The composer normally carries the model chip; the dropzone has no
                toolbar, so surface it here — switching model is how you get back
                to chat. */}
            <ModelChip />
          </div>
        ) : (
          <ChatInput onSend={handleSend} autoFocus />
        )}
      </div>
    </div>
  );
}
