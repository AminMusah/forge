"use client";

import * as React from "react";

import { DeleteChatModal } from "@/components/modals/delete-chat-modal";
import { ProvidersModal } from "@/components/modals/providers-modal";
import { RemoveModelModal } from "@/components/modals/remove-model-modal";
import { RenameChatModal } from "@/components/modals/rename-chat-modal";
import { SearchChatsModal } from "@/components/modals/search-chats-modal";
import { useChatProviderStore } from "@/hooks/use-chat-provider-store";
import { useCodegenProviderStore } from "@/hooks/use-codegen-provider-store";
import { useTokenStore } from "@/hooks/use-token-store";

export function ModalProvider() {
  const [mounted, setMounted] = React.useState(false);
  const refreshToken = useTokenStore((state) => state.refresh);
  const refreshChat = useChatProviderStore((state) => state.refresh);
  const refreshCodegen = useCodegenProviderStore((state) => state.refresh);

  React.useEffect(() => {
    setMounted(true);
    // Every credential lives in an httpOnly cookie, so only the server can tell
    // us whether it's set.
    void refreshToken();
    void refreshChat();
    void refreshCodegen();
  }, [refreshToken, refreshChat, refreshCodegen]);

  if (!mounted) return null;

  return (
    <>
      <SearchChatsModal />
      <RenameChatModal />
      <DeleteChatModal />
      <ProvidersModal />
      <RemoveModelModal />
    </>
  );
}
