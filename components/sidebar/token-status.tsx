"use client";

import { Key } from "reicon-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useCodegenProviderStore } from "@/hooks/use-codegen-provider-store";
import { useModal } from "@/hooks/use-modal-store";
import { useTokenStore } from "@/hooks/use-token-store";
import { cn } from "@/lib/utils";

export function TokenStatus() {
  const { onOpen } = useModal();
  const hasToken = useTokenStore((state) => state.hasToken);
  const hasProvider = useCodegenProviderStore((state) => state.hasProvider);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={() => onOpen("providers")}>
          <Key />
          <span className="flex-1 truncate">Providers</span>
          <span className="flex items-center gap-1">
            <StatusDot on={hasToken} label="Hugging Face token" />
            <StatusDot on={hasProvider} label="Codegen provider" />
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function StatusDot({ on, label }: { on: boolean | null; label: string }) {
  if (on === null) return null;
  return (
    <span
      aria-label={on ? `${label} set` : `${label} not set`}
      className={cn(
        "size-2 shrink-0 rounded-full",
        on ? "bg-emerald-500" : "bg-muted-foreground/40"
      )}
    />
  );
}
