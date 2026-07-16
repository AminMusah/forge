"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useModal } from "@/hooks/use-modal-store";

/** Removing weights is cheap to undo (re-download) but expensive to redo. */
export function RemoveModelModal() {
  const { type, data, isOpen, onClose } = useModal();
  const [removing, setRemoving] = React.useState(false);

  const open = isOpen && type === "removeModel";
  const { model, size, name, location, title, description, onConfirm } = data;
  const label = name ?? model?.name;
  const where = location ?? "this browser";

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onConfirm?.();
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title ?? "Remove downloaded model"}</DialogTitle>
          <DialogDescription>
            {description ??
              (label
                ? `"${label}" will be deleted from ${where}${size ? `, freeing ${size}` : ""}. You can get it again later.`
                : `The downloaded weights will be deleted from ${where}.`)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={removing}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleRemove()}
            disabled={removing}
          >
            {removing ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
