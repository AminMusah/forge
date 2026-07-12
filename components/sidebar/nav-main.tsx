"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Folder2, Library, Plus, Search } from "reicon-react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useModal } from "@/hooks/use-modal-store";

const workspaceItems = [
  { name: "Projects", url: "/projects", icon: Folder2 },
  { name: "Library", url: "/library", icon: Library },
];

export function NavMain() {
  const pathname = usePathname();
  const { onOpen } = useModal();

  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/" />} isActive={pathname === "/"}>
              <Plus />
              <span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => onOpen("searchChats")}>
              <Search />
              <span>Search chats</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarMenu>
          {workspaceItems.map((item) => (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton
                render={<Link href={item.url} />}
                isActive={pathname === item.url}
              >
                <item.icon />
                <span>{item.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
