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
import { useModal } from "@/hooks/use-modal-store";
import { useTokenStore } from "@/hooks/use-token-store";
import { retryPendingConversations } from "@/lib/conversation";

export function HfTokenModal() {
  const { type, isOpen, onClose } = useModal();
  const hasToken = useTokenStore((state) => state.hasToken);
  const save = useTokenStore((state) => state.save);
  const clear = useTokenStore((state) => state.clear);

  const [token, setToken] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const open = isOpen && type === "hfToken";

  React.useEffect(() => {
    if (open) setToken("");
  }, [open]);

  const handleSave = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await save(trimmed);
      toast.success("Token saved");
      onClose();
      // Resend whatever failed for want of a token, so the message the user
      // already sent gets its reply instead of sitting there unanswered.
      retryPendingConversations();
    } catch (error) {
      toast.error("Token rejected", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    await clear();
    toast.success("Token removed");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hugging Face token</DialogTitle>
          <DialogDescription>
            Forge runs models with your own token, so replies are billed to your
            Hugging Face account. It&apos;s stored in a secure cookie and never
            exposed to the browser.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <Input
            autoFocus
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="hf_…"
            autoComplete="off"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Create one at{" "}
            <a
              href="https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              huggingface.co/settings/tokens
            </a>{" "}
            with “Make calls to Inference Providers” permission.
          </p>

          <DialogFooter className="mt-4">
            {hasToken && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleClear()}
              >
                Remove token
              </Button>
            )}
            <Button type="submit" disabled={!token.trim() || saving}>
              {saving ? "Verifying…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
