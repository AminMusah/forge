"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChatRoundLine,
  Gallery2,
  Microphone,
  MoreH,
  Notes,
  Pen2,
  Sparkles,
  Trash5,
} from "reicon-react";

import { CollapsibleMenuGroup } from "@/components/sidebar/collapsible-menu-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModal } from "@/hooks/use-modal-store";
import { taskForModel } from "@/hooks/use-model-store";
import { taskLabel, type HfTask } from "@/lib/hf-tasks";
import type { Chat } from "@/lib/types";

const taskIcons: Partial<
  Record<HfTask, React.ComponentType<{ className?: string }>>
> = {
  "text-generation": ChatRoundLine,
  "automatic-speech-recognition": Microphone,
  "image-to-text": Gallery2,
  summarization: Notes,
};

/**
 * Buckets chats by their pinned model's task. The store keeps chats
 * newest-first, so insertion order gives both group order (by most recent
 * chat) and newest-first chats within each group.
 */
function groupChatsByTask(chats: Chat[]) {
  const groups = new Map<HfTask, Chat[]>();
  for (const chat of chats) {
    const task = taskForModel(chat.modelId);
    const bucket = groups.get(task);
    if (bucket) bucket.push(chat);
    else groups.set(task, [chat]);
  }
  return Array.from(groups, ([task, taskChats]) => ({
    task,
    chats: taskChats,
  }));
}

export function NavRecents() {
  const pathname = usePathname();
  const hasHydrated = useChatStore((state) => state.hasHydrated);
  const chats = useChatStore((state) => state.chats);
  const { onOpen } = useModal();

  const activeChat = chats.find((chat) => pathname === `/c/${chat.id}`);
  const activeTask = activeChat ? taskForModel(activeChat.modelId) : null;

  // User toggles, plus an auto-open whenever the active chat's task changes
  // (navigation or rebind) so the current chat never hides in a closed group.
  const [openTasks, setOpenTasks] = React.useState<ReadonlySet<HfTask>>(
    () => new Set(activeTask ? [activeTask] : []),
  );

  React.useEffect(() => {
    if (!activeTask) return;
    setOpenTasks((prev) => {
      if (prev.has(activeTask)) return prev;
      return new Set(prev).add(activeTask);
    });
  }, [activeTask]);

  // Stay silent until stored chats are read, rather than flashing "no chats".
  if (!hasHydrated || chats.length === 0) return null;

  const setGroupOpen = (task: HfTask, open: boolean) => {
    setOpenTasks((prev) => {
      const next = new Set(prev);
      if (open) next.add(task);
      else next.delete(task);
      return next;
    });
  };

  const groups = groupChatsByTask(chats);

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recents</SidebarGroupLabel>
      <SidebarMenu>
        {groups.map(({ task, chats: taskChats }) => {
          const Icon = taskIcons[task] ?? Sparkles;
          return (
            <CollapsibleMenuGroup
              key={task}
              label={taskLabel(task)}
              icon={<Icon />}
              open={openTasks.has(task)}
              onOpenChange={(open) => setGroupOpen(task, open)}
            >
              {taskChats.map((chat) => (
                <SidebarMenuSubItem key={chat.id}>
                  <SidebarMenuSubButton
                    render={<Link href={`/c/${chat.id}`} />}
                    isActive={pathname === `/c/${chat.id}`}
                  >
                    <span className="truncate">{chat.title}</span>
                  </SidebarMenuSubButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <SidebarMenuAction
                          showOnHover
                          className="top-1 group-hover/menu-sub-item:opacity-100 group-focus-within/menu-sub-item:opacity-100"
                        >
                          <MoreH />
                          <span className="sr-only">Chat options</span>
                        </SidebarMenuAction>
                      }
                    />
                    <DropdownMenuContent
                      className="w-48 rounded-lg"
                      side="bottom"
                      align="start"
                    >
                      <DropdownMenuItem
                        onClick={() => onOpen("renameChat", { chat })}
                      >
                        <Pen2 className="text-muted-foreground" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onOpen("deleteChat", { chat })}
                      >
                        <Trash5 />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuSubItem>
              ))}
            </CollapsibleMenuGroup>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
