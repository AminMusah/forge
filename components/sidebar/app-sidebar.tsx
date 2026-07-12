"use client";

import * as React from "react";

import { ModelSelector } from "@/components/sidebar/model-selector";
import { NavMain } from "@/components/sidebar/nav-main";
import { NavRecents } from "@/components/sidebar/nav-recents";
import { UserProfile } from "@/components/sidebar/user-profile";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" variant="floating" {...props}>
      <SidebarHeader>
        <ModelSelector />
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavRecents />
      </SidebarContent>
      <SidebarFooter>
        <UserProfile />
      </SidebarFooter>
    </Sidebar>
  );
}
