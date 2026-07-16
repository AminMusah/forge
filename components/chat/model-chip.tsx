"use client";

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
import { useChatStore } from "@/hooks/use-chat-store";
import { useChatModels, useModelStore } from "@/hooks/use-model-store";
import type { HfTask } from "@/lib/hf-tasks";
import type { Model } from "@/lib/types";

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
  const rebindModel = useChatStore((state) => state.rebindModel);

  // Includes the BYO-chat model (when a chat connection is set) alongside the
  // catalog, filtered to the open chat's task.
  const models = useChatModels(task);

  const handleSelect = (model: Model) => {
    setModel(model);
    const activeChatId = pathname.match(/^\/c\/([^/]+)$/)?.[1];
    if (activeChatId) rebindModel(activeChatId, model.id);
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
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Models</DropdownMenuLabel>
          {models.map((model) => (
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/models")}>
          <Box className="text-muted-foreground" />
          <span>Browse models…</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
