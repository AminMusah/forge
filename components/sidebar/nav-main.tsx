"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Folder2, Library, Plus, Search } from "reicon-react";

import { CollapsibleMenuGroup } from "@/components/sidebar/collapsible-menu-group";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useModal } from "@/hooks/use-modal-store";

/** Model sources; custom and uploaded models will join Hugging Face here. */
const modelSources = [{ name: "Hugging Face", url: "/models" }];

const workspaceItems = [
  { name: "Projects", url: "/projects", icon: Folder2 },
  { name: "Library", url: "/library", icon: Library },
];

export function NavMain() {
  const pathname = usePathname();
  const { onOpen } = useModal();

  // Controlled: navigating to a models route opens the group, but the user's
  // own toggling is preserved (an uncontrolled defaultOpen can't do both).
  const onModelsRoute = pathname.startsWith("/models");
  const [modelsOpen, setModelsOpen] = React.useState(onModelsRoute);

  React.useEffect(() => {
    if (onModelsRoute) setModelsOpen(true);
  }, [onModelsRoute]);

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
          <CollapsibleMenuGroup
            label="Models"
            icon={<Box />}
            open={modelsOpen}
            onOpenChange={setModelsOpen}
          >
            {modelSources.map((source) => (
              <SidebarMenuSubItem key={source.url}>
                <SidebarMenuSubButton
                  render={<Link href={source.url} />}
                  isActive={pathname === source.url}
                >
                  <span className="truncate">{source.name}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </CollapsibleMenuGroup>
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
