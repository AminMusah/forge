"use client";

import { usePathname, useRouter } from "next/navigation";
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
import { useChatStore } from "@/hooks/use-chat-store";
import { useModal } from "@/hooks/use-modal-store";

export function DeleteChatModal() {
  const router = useRouter();
  const pathname = usePathname();
  const { type, data, isOpen, onClose } = useModal();
  const deleteChat = useChatStore((state) => state.deleteChat);

  const open = isOpen && type === "deleteChat";
  const chat = data.chat;

  const handleDelete = () => {
    if (!chat) return;
    if (deleteChat(chat.id)) {
      toast.success("Chat deleted");
      if (pathname === `/c/${chat.id}`) router.push("/");
    } else {
      toast.error("Failed to delete chat");
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete chat</DialogTitle>
          <DialogDescription>
            {chat
              ? `"${chat.title}" will be permanently deleted. This cannot be undone.`
              : "This chat will be permanently deleted."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
