"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ChatInput } from "@/components/chat/chat-input";
import { FileDropzone } from "@/components/chat/file-dropzone";
import { ModelChip } from "@/components/chat/model-chip";
import { isSupportedTask } from "@/components/chat/task-surface";
import { VisionTaskChip } from "@/components/chat/vision-task-chip";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import {
  startConversation,
  startTranscription,
  startVisionTask,
} from "@/lib/conversation";
import { DEFAULT_VISION_TOKEN, type VisionToken } from "@/lib/vision";

export function ChatPlaceholder() {
  const router = useRouter();
  const hasHydrated = useChatStore((state) => state.hasHydrated);
  const selectedModel = useModelStore((state) => state.selectedModel);
  const [starting, setStarting] = React.useState(false);
  const [visionTask, setVisionTask] =
    React.useState<VisionToken>(DEFAULT_VISION_TOKEN);

  const task = selectedModel.task;
  const isTranscription = task === "automatic-speech-recognition";
  const isVision = task === "image-text-to-text";
  // Any other supported task is a generated playground: the user describes what
  // to build, and PlaygroundView generates the UI from the task's descriptor.
  const isPlayground =
    isSupportedTask(task) && task !== "text-generation" && !isTranscription && !isVision;

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

  // A playground is just a Chat whose replies are generated UIs — create it with
  // the request as its first turn; PlaygroundView generates from there.
  const handleStartPlayground = (content: string) => {
    flush();
    const chatId = useChatStore.getState().createChat(content, selectedModel.id);
    router.push(`/c/${chatId}`);
  };

  const handleFile = async (file: File) => {
    flush();
    setStarting(true);
    try {
      // Reading the file is the only async step — the work itself runs on the
      // surface we're about to navigate to.
      const chatId = isVision
        ? await startVisionTask(file, selectedModel.id, visionTask)
        : await startTranscription(file, selectedModel.id);
      router.push(`/c/${chatId}`);
    } catch (error) {
      setStarting(false);
      toast.error("Couldn't read that file", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const heading = isVision
    ? "What should I look at?"
    : isTranscription
      ? "What should I transcribe?"
      : isPlayground
        ? `Build a playground to test ${selectedModel.name}`
        : "How can I help you today?";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      </div>

      <div className="w-full max-w-2xl">
        {isTranscription || isVision ? (
          <div className="flex flex-col items-center gap-3">
            <FileDropzone
              kind={isVision ? "image" : "audio"}
              onFile={(file) => void handleFile(file)}
              busy={starting}
              hint={
                isVision
                  ? "Runs on your GPU — the image never leaves your machine"
                  : selectedModel.runtime === "browser"
                    ? "Runs on your GPU — the audio never leaves your machine"
                    : "Sent to Hugging Face for transcription"
              }
            />
            {/* The composer normally carries these; the dropzone has no toolbar,
                so surface them here — switching model is how you get back. */}
            <div className="flex items-center gap-2">
              {isVision && (
                <VisionTaskChip value={visionTask} onChange={setVisionTask} />
              )}
              <ModelChip />
            </div>
          </div>
        ) : isPlayground ? (
          <ChatInput
            onSend={handleStartPlayground}
            autoFocus
            task={task}
            placeholder={`Describe the playground — e.g. "let me drop an image and see the detected objects"`}
          />
        ) : (
          <ChatInput onSend={handleSend} autoFocus />
        )}
      </div>
    </div>
  );
}
