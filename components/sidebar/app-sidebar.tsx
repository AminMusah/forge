"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "reicon-react";

import { NavMain } from "@/components/sidebar/nav-main";
import { NavRecents } from "@/components/sidebar/nav-recents";
import { TokenStatus } from "@/components/sidebar/token-status";
import { GitHubLink } from "@/components/github-link";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  // On mobile the sidebar is an overlay, so navigating left it covering the very
  // page it was asked for. Closing on pathname change rather than per-link means
  // Recents and anything added later are covered without remembering to.
  React.useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return (
    <Sidebar collapsible="offcanvas" variant="floating" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 p-1 pt-2">
          <div className="flex aspect-square size-6 items-center justify-center rounded bg-[#123524] text-sidebar-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <span className="flex-1 truncate text-sm font-semibold">Forge</span>
          <GitHubLink />
          <ThemeToggle />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavRecents />
      </SidebarContent>
      <SidebarFooter>
        <TokenStatus />
      </SidebarFooter>
    </Sidebar>
  );
}
