"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, Download, Music, Refresh } from "reicon-react";

import { AudioDropzone } from "@/components/chat/audio-dropzone";
import { AudioPlayer } from "@/components/chat/audio-player";
import { ModelChip } from "@/components/chat/model-chip";
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
import { sendAudioToConversation } from "@/lib/conversation";
import type { ChatMessage } from "@/lib/types";

interface TranscribeViewProps {
  chatId: string;
}

/**
 * A transcription thread: each clip is a message, each transcript is the reply.
 * Structurally it IS a chat — same scroller, same message rows, same composer
 * slot — and the composer is a dropzone rather than a textarea. Dropping a file
 * appends a turn, exactly as typing would.
 *
 * Only mounted once the chat store has hydrated — see ChatPage.
 */
export function TranscribeView({ chatId }: TranscribeViewProps) {
  const exists = useChatStore((state) =>
    state.chats.some((c) => c.id === chatId)
  );
  const modelId = useChatStore(
    (state) => state.chats.find((c) => c.id === chatId)?.modelId
  );

  const { messages, streamingId, isStreaming, regenerate } =
    useConversation(chatId);
  const [reading, setReading] = React.useState(false);

  // Keep the model chip describing the chat being viewed.
  React.useEffect(() => {
    const { models, setModel } = useModelStore.getState();
    const model = models.find((m) => m.id === modelId);
    if (model) setModel(model);
  }, [modelId]);

  const handleFile = async (file: File) => {
    setReading(true);
    try {
      await sendAudioToConversation(chatId, file);
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
        <h1 className="text-lg font-semibold">Transcription not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been deleted. Start a new one from the sidebar.
        </p>
      </div>
    );
  }

  const lastId = messages.at(-1)?.id;

  // Retry re-runs the clip that produced the last transcript — so it's only
  // offered while that clip's bytes are still loaded. After a reload they're
  // gone, and a Retry that can only fail is worse than no Retry.
  const lastClip = messages.findLast((m) => m.role === "user" && m.file);
  const canRetry = Boolean(lastClip?.file?.url);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
                {messages.map((message) => (
                  <TranscriptRow
                    key={message.id}
                    message={message}
                    isStreaming={message.id === streamingId}
                    // Only the last reply is regenerable — the SDK truncates the
                    // transcript from the regenerated message onward anyway.
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
        <AudioDropzone
          compact
          onFile={(file) => void handleFile(file)}
          busy={reading || isStreaming}
          // Transcription models only: this chat's task decides which surface
          // renders it, so re-pinning to a chat model would swap this thread of
          // audio out for a ChatView that can't render any of it.
          actions={<ModelChip task="automatic-speech-recognition" />}
        />
      </div>
    </div>
  );
}

/**
 * Not memoized, unlike MessageRow: a transcript arrives as ONE delta (both
 * runtimes hand back the whole thing at once), so there is no per-token
 * re-render for a comparator to protect against.
 */
function TranscriptRow({
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
            <ClipBubble message={message} />
          ) : (
            <div className="flex flex-col gap-2">
              {message.content ? (
                <>
                  {/* Plain text, not markdown: a transcript is what was said, and
                      markdown would silently eat a spoken "*" or "#". */}
                  <p className="whitespace-pre-wrap text-sm/relaxed">
                    {message.content}
                  </p>
                  {!isStreaming && (
                    <TranscriptActions
                      transcript={message.content}
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

/** The clip itself: the message the user "sent". */
function ClipBubble({ message }: { message: ChatMessage }) {
  // Stripped when the store was persisted: after a reload there is nothing to
  // play, so the row says so instead of rendering a player that can't work.
  const url = message.file?.url;

  return (
    <Bubble variant="muted">
      <BubbleContent className="flex w-full max-w-md flex-col gap-3 text-sm/relaxed">
        <div className="flex items-center gap-2">
          <Music className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {message.file?.name ?? "Audio"}
          </span>
        </div>

        {url ? (
          <AudioPlayer src={url} messageId={message.id} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Audio isn&apos;t kept after a reload
          </p>
        )}
      </BubbleContent>
    </Bubble>
  );
}

/**
 * What a transcription shows before it lands. For a browser model that's the
 * download/compile progress — transient state, deliberately not in the
 * transcript.
 */
function PendingStatus() {
  const status = useModelLoadStore((state) => state.status);

  return (
    <p className="animate-pulse text-muted-foreground" role="status">
      {status ?? "Transcribing…"}
    </p>
  );
}

function TranscriptActions({
  transcript,
  onRegenerate,
}: {
  transcript: string;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the transcript.");
    }
  };

  // Copy handles the short ones; an hour-long interview is a file, not a paste.
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([transcript], { type: "text/plain" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "transcript.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  // Only hidden where hover exists — on touch there is no hover, so the actions
  // stay visible rather than being unreachable.
  return (
    <div className="flex items-center gap-1 transition-opacity duration-150 ease-out focus-within:opacity-100 can-hover:opacity-0 can-hover:group-hover/message-row:opacity-100">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Copy transcript"
        onClick={() => void copy()}
      >
        <IconSwap showing={copied} on={<Check />} off={<Copy />} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Download transcript"
        onClick={download}
      >
        <Download />
      </Button>
      {onRegenerate && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Transcribe again"
          onClick={onRegenerate}
        >
          <Refresh />
        </Button>
      )}
    </div>
  );
}
