"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChatRoundLine,
  Flask,
  MoreH,
  Pen2,
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
import type { Chat } from "@/lib/types";

/**
 * Recents are split by SURFACE, not per-task: a text-generation chat is the
 * hand-built ChatView, everything else is a generated PlaygroundView — the two
 * real surfaces. Within each, chats stay newest-first (the store's order).
 */
type Surface = "chat" | "playground";

const surfaceOf = (chat: Chat): Surface =>
  taskForModel(chat.modelId) === "text-generation" ? "chat" : "playground";

const SURFACES: { key: Surface; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "chat", label: "Chats", icon: ChatRoundLine },
  { key: "playground", label: "Playgrounds", icon: Flask },
];

export function NavRecents() {
  const pathname = usePathname();
  const hasHydrated = useChatStore((state) => state.hasHydrated);
  const chats = useChatStore((state) => state.chats);
  const { onOpen } = useModal();

  const activeChat = chats.find((chat) => pathname === `/c/${chat.id}`);
  const activeSurface = activeChat ? surfaceOf(activeChat) : null;

  // User toggles, plus an auto-open whenever the active chat's surface changes
  // so the current chat never hides in a closed group.
  const [openSurfaces, setOpenSurfaces] = React.useState<ReadonlySet<Surface>>(
    () => new Set(activeSurface ? [activeSurface] : [])
  );

  React.useEffect(() => {
    if (!activeSurface) return;
    setOpenSurfaces((prev) => {
      if (prev.has(activeSurface)) return prev;
      return new Set(prev).add(activeSurface);
    });
  }, [activeSurface]);

  // Stay silent until stored chats are read, rather than flashing "no chats".
  if (!hasHydrated || chats.length === 0) return null;

  const setGroupOpen = (surface: Surface, open: boolean) => {
    setOpenSurfaces((prev) => {
      const next = new Set(prev);
      if (open) next.add(surface);
      else next.delete(surface);
      return next;
    });
  };

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recents</SidebarGroupLabel>
      <SidebarMenu>
        {SURFACES.map(({ key, label, icon: Icon }) => {
          const bucket = chats.filter((chat) => surfaceOf(chat) === key);
          if (bucket.length === 0) return null;
          return (
            <CollapsibleMenuGroup
              key={key}
              label={label}
              icon={<Icon />}
              open={openSurfaces.has(key)}
              onOpenChange={(open) => setGroupOpen(key, open)}
            >
              {bucket.map((chat) => (
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
