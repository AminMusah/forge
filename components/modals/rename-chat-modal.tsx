"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModal } from "@/hooks/use-modal-store";

export function RenameChatModal() {
  const { type, data, isOpen, onClose } = useModal();
  const renameChat = useChatStore((state) => state.renameChat);
  const [title, setTitle] = React.useState("");

  const open = isOpen && type === "renameChat";
  const chat = data.chat;

  React.useEffect(() => {
    if (open && chat) setTitle(chat.title);
  }, [open, chat]);

  const handleSave = () => {
    const trimmed = title.trim();
    if (chat && trimmed) {
      if (renameChat(chat.id, trimmed)) {
        toast.success("Chat renamed");
      } else {
        toast.error("Failed to rename chat");
      }
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>Give this conversation a new title.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Chat title"
          />
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
