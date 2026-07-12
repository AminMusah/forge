"use client";

import * as React from "react";

import { DeleteChatModal } from "@/components/modals/delete-chat-modal";
import { RenameChatModal } from "@/components/modals/rename-chat-modal";
import { SearchChatsModal } from "@/components/modals/search-chats-modal";

export function ModalProvider() {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <SearchChatsModal />
      <RenameChatModal />
      <DeleteChatModal />
    </>
  );
}
