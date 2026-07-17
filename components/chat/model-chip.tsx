"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Box, Check, ChevronExpandY, Sparkles } from "reicon-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatProviderStore } from "@/hooks/use-chat-provider-store";
import { useChatModels, useModelStore } from "@/hooks/use-model-store";
import { rebindConversation } from "@/lib/conversation";
import type { HfTask } from "@/lib/hf-tasks";
import { selectTransport } from "@/lib/transport-kind";
import type { Model } from "@/lib/types";

/**
 * Models are grouped by WHERE THEY RUN, because that's the only thing separating
 * two entries with the same name — a BYO connection to gpt-oss-120b and the
 * catalog's router-backed one are both "gpt-oss-120b", and picking the wrong one
 * asks for a Hugging Face token you may not have. It's also what the user is
 * really choosing between: their GPU, their key, or ours.
 */
const GROUP_LABELS = {
  browser: "In your browser",
  byo: "Your provider",
  "hf-router": "Hugging Face",
} as const;

type Group = keyof typeof GROUP_LABELS;

/** Local-first, matching what a fresh install defaults to. */
const GROUP_ORDER: Group[] = ["browser", "byo", "hf-router"];

function groupOf(model: Model, chatBaseURL: string | null): Group {
  const kind = selectTransport(model, chatBaseURL);
  // "local" and "byo" are the same connection — they differ only in whether a
  // hosted server could reach the endpoint, which is plumbing, not a heading.
  return kind === "local" ? "byo" : kind;
}

interface ModelChipProps {
  /**
   * Restrict the menu to models for this task. Pass it inside an open chat: a
   * chat's task decides which surface renders it, so re-pinning a transcription
   * to a text model would swap the whole view out from under a thread of audio.
   * The home screen passes nothing — switching task there is the point.
   */
  task?: HfTask;
}

/** Shows the active model on the composer; picking re-pins the open chat. */
export function ModelChip({ task }: ModelChipProps) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedModel = useModelStore((state) => state.selectedModel);
  const setModel = useModelStore((state) => state.setModel);

  // Includes the BYO-chat model (when a chat connection is set) alongside the
  // catalog, filtered to the open chat's task.
  const models = useChatModels(task);
  const baseURL = useChatProviderStore((state) => state.baseURL);

  const groups = React.useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        items: models.filter((model) => groupOf(model, baseURL) === group),
      })).filter(({ items }) => items.length > 0),
    [models, baseURL]
  );

  const handleSelect = (model: Model) => {
    setModel(model);
    const activeChatId = pathname.match(/^\/c\/([^/]+)$/)?.[1];
    if (activeChatId) rebindConversation(activeChatId, model.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 rounded-full bg-muted px-3 text-xs hover:bg-muted/80"
          />
        }
      >
        <Sparkles className="size-3.5" />
        <span className="max-w-44 truncate">{selectedModel.name}</span>
        <ChevronExpandY className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72">
        {groups.map(({ group, items }, index) => (
          <React.Fragment key={group}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{GROUP_LABELS[group]}</DropdownMenuLabel>
              {items.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => handleSelect(model)}
                >
                  <div className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate font-medium">{model.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {model.description}
                    </span>
                  </div>
                  {model.id === selectedModel.id && (
                    <Check className="size-4 shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </React.Fragment>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/models")}>
          <Box className="text-muted-foreground" />
          <span>Browse models…</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
