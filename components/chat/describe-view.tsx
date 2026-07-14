"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, Refresh } from "reicon-react";

import { FileDropzone } from "@/components/chat/file-dropzone";
import { ModelChip } from "@/components/chat/model-chip";
import { VisionTaskChip } from "@/components/chat/vision-task-chip";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { IconSwap } from "@/components/ui/icon-swap";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { useChatStore } from "@/hooks/use-chat-store";
import { useConversation } from "@/hooks/use-conversation";
import { useModelLoadStore } from "@/hooks/use-model-load-store";
import { useModelStore } from "@/hooks/use-model-store";
import { sendImageToConversation } from "@/lib/conversation";
import type { ChatMessage } from "@/lib/types";
import { DEFAULT_VISION_TOKEN, visionLabel, type VisionToken } from "@/lib/vision";

interface DescribeViewProps {
  chatId: string;
}

/**
 * An image-reading thread: each image is a message, what the model saw is the
 * reply. Structurally identical to the transcription thread — the registry means
 * a new task is a surface and a worker branch, and nothing else.
 *
 * Only mounted once the chat store has hydrated — see ChatPage.
 */
export function DescribeView({ chatId }: DescribeViewProps) {
  const exists = useChatStore((state) =>
    state.chats.some((c) => c.id === chatId)
  );
  const modelId = useChatStore(
    (state) => state.chats.find((c) => c.id === chatId)?.modelId
  );

  const { messages, streamingId, isStreaming, regenerate } =
    useConversation(chatId);
  const [reading, setReading] = React.useState(false);
  const [task, setTask] = React.useState<VisionToken>(DEFAULT_VISION_TOKEN);

  // Keep the model chip describing the chat being viewed.
  React.useEffect(() => {
    const { models, setModel } = useModelStore.getState();
    const model = models.find((m) => m.id === modelId);
    if (model) setModel(model);
  }, [modelId]);

  const handleFile = async (file: File) => {
    setReading(true);
    try {
      await sendImageToConversation(chatId, file, task);
    } catch (error) {
      toast.error("Couldn't read that file", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setReading(false);
    }
  };

  if (!exists) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-lg font-semibold">Image not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been deleted. Start a new one from the sidebar.
        </p>
      </div>
    );
  }

  const lastId = messages.at(-1)?.id;
  // The bytes are stripped on persist, so after a reload there's no image to
  // re-read — and a Retry that can only fail is worse than no Retry.
  const lastImage = messages.findLast((m) => m.role === "user" && m.file);
  const canRetry = Boolean(lastImage?.file?.url);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
                {messages.map((message) => (
                  <DescribeRow
                    key={message.id}
                    message={message}
                    isStreaming={message.id === streamingId}
                    onRegenerate={
                      canRetry &&
                      message.id === lastId &&
                      message.role === "assistant"
                        ? regenerate
                        : undefined
                    }
                  />
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        <FileDropzone
          kind="image"
          compact
          onFile={(file) => void handleFile(file)}
          busy={reading || isStreaming}
          actions={
            <>
              <VisionTaskChip value={task} onChange={setTask} />
              {/* Vision models only — re-pinning to a chat model would swap this
                  thread of images for a view that can't render any of it. */}
              <ModelChip task="image-text-to-text" />
            </>
          }
        />
      </div>
    </div>
  );
}

function DescribeRow({
  message,
  isStreaming,
  onRegenerate,
}: {
  message: ChatMessage;
  isStreaming: boolean;
  onRegenerate?: () => void;
}) {
  return (
    <MessageScrollerItem
      messageId={message.id}
      scrollAnchor={message.role === "user"}
      className="group/message-row"
    >
      <Message
        align={message.role === "user" ? "end" : "start"}
        className="text-sm/relaxed"
      >
        <MessageContent>
          {message.role === "user" ? (
            <ImageBubble message={message} />
          ) : (
            <div className="flex flex-col gap-2">
              {message.content ? (
                <>
                  {/* Plain text, not markdown: OCR returns what was written, and
                      markdown would eat a literal "*" or "#" off a sign. */}
                  <p className="whitespace-pre-wrap text-sm/relaxed">
                    {message.content}
                  </p>
                  {!isStreaming && (
                    <ResultActions
                      text={message.content}
                      onRegenerate={onRegenerate}
                    />
                  )}
                </>
              ) : (
                <PendingStatus />
              )}
            </div>
          )}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

/** The image, and what was asked of it. */
function ImageBubble({ message }: { message: ChatMessage }) {
  const url = message.file?.url;

  return (
    <Bubble variant="muted">
      <BubbleContent className="flex w-full max-w-xs flex-col gap-2 text-sm/relaxed">
        {url ? (
          // Not next/image: this is a data URL held in memory for the session,
          // and there is nothing for the optimizer to fetch or cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={message.file?.name ?? "Submitted image"}
            className="max-h-64 w-full rounded-lg object-contain"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Image isn&apos;t kept after a reload
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {message.file?.name}
          </span>
          {/* The task token IS the message text — show what was asked. */}
          <span className="shrink-0 rounded-full bg-background/60 px-2 py-0.5 text-xs">
            {visionLabel(message.content)}
          </span>
        </div>
      </BubbleContent>
    </Bubble>
  );
}

function PendingStatus() {
  const status = useModelLoadStore((state) => state.status);

  return (
    <p className="animate-pulse text-muted-foreground" role="status">
      {status ?? "Reading image…"}
    </p>
  );
}

function ResultActions({
  text,
  onRegenerate,
}: {
  text: string;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy that.");
    }
  };

  return (
    <div className="flex items-center gap-1 transition-opacity duration-150 ease-out focus-within:opacity-100 can-hover:opacity-0 can-hover:group-hover/message-row:opacity-100">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Copy"
        onClick={() => void copy()}
      >
        <IconSwap showing={copied} on={<Check />} off={<Copy />} />
      </Button>
      {onRegenerate && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Read again"
          onClick={onRegenerate}
        >
          <Refresh />
        </Button>
      )}
    </div>
  );
}
