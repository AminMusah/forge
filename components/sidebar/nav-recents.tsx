"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreH, Pen2, Trash, Trash5 } from "reicon-react";

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
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModal } from "@/hooks/use-modal-store";

export function NavRecents() {
  const pathname = usePathname();
  const chats = useChatStore((state) => state.chats);
  const { onOpen } = useModal();

  if (chats.length === 0) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recents</SidebarGroupLabel>
      <SidebarMenu>
        {chats.map((chat) => (
          <SidebarMenuItem key={chat.id}>
            <SidebarMenuButton
              render={<Link href={`/c/${chat.id}`} />}
              isActive={pathname === `/c/${chat.id}`}
            >
              <span className="truncate">{chat.title}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuAction showOnHover>
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
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
