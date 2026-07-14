"use client";

import * as React from "react";

import { DeleteChatModal } from "@/components/modals/delete-chat-modal";
import { HfTokenModal } from "@/components/modals/hf-token-modal";
import { RemoveModelModal } from "@/components/modals/remove-model-modal";
import { RenameChatModal } from "@/components/modals/rename-chat-modal";
import { SearchChatsModal } from "@/components/modals/search-chats-modal";
import { useTokenStore } from "@/hooks/use-token-store";

export function ModalProvider() {
  const [mounted, setMounted] = React.useState(false);
  const refresh = useTokenStore((state) => state.refresh);

  React.useEffect(() => {
    setMounted(true);
    // The token cookie is httpOnly, so only the server can tell us it exists.
    void refresh();
  }, [refresh]);

  if (!mounted) return null;

  return (
    <>
      <SearchChatsModal />
      <RenameChatModal />
      <DeleteChatModal />
      <HfTokenModal />
      <RemoveModelModal />
    </>
  );
}
