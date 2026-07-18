"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
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

/**
 * Recents are split by SURFACE, not per-task: a text-generation chat is the
 * hand-built ChatView, everything else is a generated PlaygroundView — the two
 * real surfaces. Within each, chats stay newest-first (the store's order).
 */
type Surface = "chat" | "playground";

const surfaceOf = (modelId: string): Surface =>
  taskForModel(modelId) === "text-generation" ? "chat" : "playground";

const SURFACES: { key: Surface; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "chat", label: "Chats", icon: ChatRoundLine },
  { key: "playground", label: "Playgrounds", icon: Flask },
];

interface RecentRowProps {
  chatId: string;
  isActive: boolean;
}

/**
 * One recents row. It subscribes to its own title rather than receiving a chat
 * object, so the row of a chat that's mid-stream re-renders only if its title
 * actually changes — a token doesn't touch it.
 */
const RecentRow = React.memo(function RecentRow({
  chatId,
  isActive,
}: RecentRowProps) {
  const title = useChatStore(
    (state) => state.chats.find((c) => c.id === chatId)?.title
  );
  const { onOpen } = useModal();

  // The modals take a whole Chat (see use-modal-store). Resolve it on click
  // rather than subscribing to the object, which changes on every token.
  const open = (type: "renameChat" | "deleteChat") => {
    const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (chat) onOpen(type, { chat });
  };

  if (title === undefined) return null;

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        render={<Link href={`/c/${chatId}`} />}
        isActive={isActive}
      >
        <span className="truncate" title={title}>
          {title}
        </span>
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
          <DropdownMenuItem onClick={() => open("renameChat")}>
            <Pen2 className="text-muted-foreground" />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => open("deleteChat")}
          >
            <Trash5 />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuSubItem>
  );
});

export function NavRecents() {
  const pathname = usePathname();
  const hasHydrated = useChatStore((state) => state.hasHydrated);

  /**
   * Ids and pinned models, as strings — never the chat objects. The transcript
   * sync replaces the chats array on every streamed token (see syncMessages),
   * and recents reads none of what a token changes. Strings are what make
   * useShallow work: a projection to objects would mint new identities each call
   * and re-render anyway. Each row subscribes to its own title.
   */
  const rows = useChatStore(
    useShallow((state) => state.chats.map((c) => `${c.id} ${c.modelId}`))
  );

  const entries = React.useMemo(
    () =>
      rows.map((row) => {
        const sep = row.indexOf(" ");
        return { id: row.slice(0, sep), modelId: row.slice(sep + 1) };
      }),
    [rows]
  );

  const activeEntry = entries.find((entry) => pathname === `/c/${entry.id}`);
  const activeSurface = activeEntry ? surfaceOf(activeEntry.modelId) : null;

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

  // Each chat's surface computed once per entries change, not once per surface
  // per render — surfaceOf scans the model catalog.
  const bucketed = React.useMemo(() => {
    const bySurface: Record<Surface, { id: string; modelId: string }[]> = {
      chat: [],
      playground: [],
    };
    for (const entry of entries) bySurface[surfaceOf(entry.modelId)].push(entry);
    return bySurface;
  }, [entries]);

  // Stay silent until stored chats are read, rather than flashing "no chats".
  if (!hasHydrated || entries.length === 0) return null;

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
          const bucket = bucketed[key];
          if (bucket.length === 0) return null;
          return (
            <CollapsibleMenuGroup
              key={key}
              label={label}
              icon={<Icon />}
              open={openSurfaces.has(key)}
              onOpenChange={(open) => setGroupOpen(key, open)}
            >
              {bucket.map((entry) => (
                <RecentRow
                  key={entry.id}
                  chatId={entry.id}
                  isActive={pathname === `/c/${entry.id}`}
                />
              ))}
            </CollapsibleMenuGroup>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
