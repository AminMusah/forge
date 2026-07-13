"use client";

import { usePathname } from "next/navigation";
import { Check, ChevronExpandY, Sparkles } from "reicon-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { models, type Model } from "@/lib/mock-data";

export function ModelSelector() {
  const pathname = usePathname();
  const { selectedModel, setModel } = useModelStore();
  const rebindModel = useChatStore((state) => state.rebindModel);

  const handleSelect = (model: Model) => {
    setModel(model);
    // Inside a chat, picking a model re-pins that chat to it.
    const activeChatId = pathname.match(/^\/c\/([^/]+)$/)?.[1];
    if (activeChatId) rebindModel(activeChatId, model.id);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <div className="w-full flex gap-1 items-center pt-2">
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="h-8 p-1 aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-6 items-center justify-center rounded bg-[#123524] text-sidebar-primary-foreground">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {selectedModel.name}
                    </span>
                  </div>
                  <ChevronExpandY className="ml-auto" />
                </SidebarMenuButton>
              }
            />
          </div>
          <DropdownMenuContent side="bottom" align="end" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Models</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {models.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => handleSelect(model)}
                >
                  <div className="grid flex-1 leading-tight">
                    <span className="font-medium">{model.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {model.description}
                    </span>
                  </div>
                  {model.id === selectedModel.id && (
                    <Check className="size-4" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
