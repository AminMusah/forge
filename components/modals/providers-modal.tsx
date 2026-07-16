"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useCodegenProviderStore } from "@/hooks/use-codegen-provider-store";
import { useModal } from "@/hooks/use-modal-store";
import { useTokenStore } from "@/hooks/use-token-store";
import { retryPendingConversations } from "@/lib/conversation";
import { CODEGEN_PRESETS } from "@/lib/playground/codegen-connection";
import { cn } from "@/lib/utils";

/**
 * One place for every cloud credential. Two sections of the SAME shape — a
 * Hugging Face token for chat, and an OpenAI-compatible connection for codegen —
 * so the user never has to wonder why one is "a token" and the other "a URL".
 * They differ only in policy: chat is strict-BYO; codegen has a shared default.
 */
export function ProvidersModal() {
  const { type, isOpen, onClose } = useModal();
  const open = isOpen && type === "providers";

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Providers</DialogTitle>
          <DialogDescription>
            Bring your own keys. Both are stored in secure cookies and never
            exposed to the browser.
          </DialogDescription>
        </DialogHeader>

        <HfTokenSection onClose={onClose} />
        <Separator />
        <CodegenProviderSection />
      </DialogContent>
    </Dialog>
  );
}

/** Chat — strict BYO: without a token, cloud chat 401s. */
function HfTokenSection({ onClose }: { onClose: () => void }) {
  const hasToken = useTokenStore((s) => s.hasToken);
  const save = useTokenStore((s) => s.save);
  const clear = useTokenStore((s) => s.clear);

  const [token, setToken] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await save(trimmed);
      setToken("");
      toast.success("Hugging Face token saved");
      // Resend whatever failed for want of a token, so an already-sent message
      // gets its reply instead of sitting there unanswered.
      retryPendingConversations();
      onClose();
    } catch (error) {
      toast.error("Token rejected", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Hugging Face token</h3>
        <StatusDot on={hasToken} />
        <span className="ml-auto text-xs text-muted-foreground">for chat</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Cloud chat is billed to your account. Local models need no token.
      </p>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="hf_…"
          autoComplete="off"
        />
        {hasToken && (
          <Button type="button" variant="outline" onClick={() => void clear()}>
            Remove
          </Button>
        )}
        <Button type="submit" disabled={!token.trim() || saving}>
          {saving ? "Verifying…" : "Save"}
        </Button>
      </form>
      <p className="mt-1.5 text-xs text-muted-foreground">
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
    </section>
  );
}

/** Codegen — OpenAI-compatible; has a shared default, so this is optional. */
function CodegenProviderSection() {
  const hasProvider = useCodegenProviderStore((s) => s.hasProvider);
  const storedBaseURL = useCodegenProviderStore((s) => s.baseURL);
  const storedModelId = useCodegenProviderStore((s) => s.modelId);
  const save = useCodegenProviderStore((s) => s.save);
  const clear = useCodegenProviderStore((s) => s.clear);

  // Prefill from what's stored, else the first (Groq) preset.
  const [baseURL, setBaseURL] = React.useState("");
  const [modelId, setModelId] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const preset = CODEGEN_PRESETS[0];
    setBaseURL(storedBaseURL ?? preset.baseURL);
    setModelId(storedModelId ?? preset.defaultModelId);
  }, [storedBaseURL, storedModelId]);

  const activePreset = CODEGEN_PRESETS.find((p) => p.baseURL === baseURL);

  const applyPreset = (value: string) => {
    const preset = CODEGEN_PRESETS.find((p) => p.baseURL === value);
    if (!preset) return;
    setBaseURL(preset.baseURL);
    setModelId(preset.defaultModelId);
  };

  const handleSave = async () => {
    if (!baseURL.trim() || !apiKey.trim() || !modelId.trim()) return;
    setSaving(true);
    try {
      await save({ baseURL: baseURL.trim(), apiKey: apiKey.trim(), modelId: modelId.trim() });
      setApiKey("");
      toast.success("Codegen provider saved");
    } catch (error) {
      toast.error("Connection rejected", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Codegen provider</h3>
        <StatusDot on={hasProvider} />
        <span className="ml-auto text-xs text-muted-foreground">
          for playgrounds · optional
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        The AI that writes playground UIs. Any OpenAI-compatible endpoint. Leave
        blank to use the shared default.
      </p>

      <form
        className="mt-2 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <select
          value={activePreset?.baseURL ?? ""}
          onChange={(e) => applyPreset(e.target.value)}
          className={cn(
            "h-7 w-full rounded-md border border-input bg-input/20 px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
          )}
        >
          {!activePreset && <option value="">Custom</option>}
          {CODEGEN_PRESETS.map((p) => (
            <option key={p.baseURL} value={p.baseURL}>
              {p.label}
            </option>
          ))}
        </select>

        <Input
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          placeholder="https://…/v1"
          autoComplete="off"
          spellCheck={false}
        />
        <Input
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="model id"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="flex gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={activePreset?.local ? "no key needed" : "API key"}
            autoComplete="off"
          />
          {hasProvider && (
            <Button type="button" variant="outline" onClick={() => void clear()}>
              Remove
            </Button>
          )}
          <Button
            type="submit"
            disabled={!baseURL.trim() || !apiKey.trim() || !modelId.trim() || saving}
          >
            {saving ? "Verifying…" : "Save"}
          </Button>
        </div>
      </form>
      {activePreset?.keyUrl && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Get a key at{" "}
          <a
            href={activePreset.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {new URL(activePreset.keyUrl).host}
          </a>
        </p>
      )}
    </section>
  );
}

function StatusDot({ on }: { on: boolean | null }) {
  if (on === null) return null;
  return (
    <span
      aria-label={on ? "Set" : "Not set"}
      className={cn(
        "size-2 shrink-0 rounded-full",
        on ? "bg-emerald-500" : "bg-muted-foreground/40"
      )}
    />
  );
}
