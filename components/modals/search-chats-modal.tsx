"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ChatRound, Search } from "reicon-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModal } from "@/hooks/use-modal-store";

export function SearchChatsModal() {
  const router = useRouter();
  const { type, isOpen, onClose } = useModal();
  const chats = useChatStore((state) => state.chats);
  const [query, setQuery] = React.useState("");

  const open = isOpen && type === "searchChats";
  const results = chats.filter((chat) =>
    chat.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && handleClose()}>
      <DialogContent
        className="top-1/3 p-0 gap-0 overflow-hidden sm:max-w-md"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search chats</DialogTitle>
          <DialogDescription>Find a conversation by title</DialogDescription>
        </DialogHeader>
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats..."
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No chats found.
            </p>
          ) : (
            results.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
                onClick={() => {
                  router.push(`/c/${chat.id}`);
                  handleClose();
                }}
              >
                <ChatRound className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{chat.title}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
