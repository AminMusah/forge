"use client";

import { Key } from "reicon-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useModal } from "@/hooks/use-modal-store";
import { useTokenStore } from "@/hooks/use-token-store";
import { cn } from "@/lib/utils";

export function TokenStatus() {
  const { onOpen } = useModal();
  const hasToken = useTokenStore((state) => state.hasToken);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={() => onOpen("hfToken")}>
          <Key />
          <span className="flex-1 truncate">Hugging Face token</span>
          {hasToken !== null && (
            <span
              aria-label={hasToken ? "Token set" : "No token"}
              className={cn(
                "size-2 shrink-0 rounded-full",
                hasToken ? "bg-emerald-500" : "bg-muted-foreground/40"
              )}
            />
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
