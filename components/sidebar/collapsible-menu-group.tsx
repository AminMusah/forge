"use client";

import * as React from "react";
import { ChevronRight } from "reicon-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";

interface CollapsibleMenuGroupProps {
  label: string;
  icon?: React.ReactNode;
  /** Uncontrolled initial state; ignored when `open` is provided. */
  defaultOpen?: boolean;
  /** Controlled open state; pair with onOpenChange. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Rendered as a sibling of the trigger, e.g. a SidebarMenuAction dropdown. */
  headerAction?: React.ReactNode;
  /** SidebarMenuSubItem elements. */
  children: React.ReactNode;
}

/** A collapsible sidebar menu row whose panel nests sub-items. */
export function CollapsibleMenuGroup({
  label,
  icon,
  defaultOpen = false,
  open,
  onOpenChange,
  headerAction,
  children,
}: CollapsibleMenuGroupProps) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      className="group/collapsible"
      render={<SidebarMenuItem />}
    >
      {/* Sub-item actions inside this li would trigger the menu button's
          has-menu-action pr-8 rule and shift the chevron; keep base padding. */}
      <CollapsibleTrigger
        render={
          <SidebarMenuButton className="group-has-data-[sidebar=menu-action]/menu-item:pr-2" />
        }
      >
        {icon}
        <span className="truncate">{label}</span>
        <ChevronRight className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-open/collapsible:rotate-90" />
      </CollapsibleTrigger>
      {headerAction}
      <CollapsibleContent>
        <SidebarMenuSub>{children}</SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}
