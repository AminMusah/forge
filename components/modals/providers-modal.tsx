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
import { useChatProviderStore } from "@/hooks/use-chat-provider-store";
import { useCodegenProviderStore } from "@/hooks/use-codegen-provider-store";
import { useModal } from "@/hooks/use-modal-store";
import { useTokenStore } from "@/hooks/use-token-store";
import { retryPendingConversations } from "@/lib/conversation";
import {
  PROVIDER_PRESETS,
  isLocalBaseURL,
  listLocalModels,
  localProvidersAvailable,
} from "@/lib/connection";
import { cn } from "@/lib/utils";

/**
 * One place for every cloud credential. A Hugging Face token for HF-routed chat,
 * and two OpenAI-compatible connections of the same shape — one for chatting
 * against your own provider, one for the codegen that writes playgrounds — so
 * the user never wonders why one is "a token" and another "a URL". They differ
 * only in policy: HF chat is strict-BYO; the two connections are optional.
 */
export function ProvidersModal() {
  const { type, isOpen, onClose } = useModal();
  const open = isOpen && type === "providers";

  const chat = useChatProviderStore();
  const codegen = useCodegenProviderStore();

  // Resolved after mount, not during render: localProvidersAvailable() reads
  // window, so an SSR'd `false` and a client `true` would be a hydration
  // mismatch. Starting false also fails safe — we hide a working provider for a
  // frame rather than advertising a broken one.
  const [allowLocal, setAllowLocal] = React.useState(false);
  React.useEffect(() => setAllowLocal(localProvidersAvailable()), []);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="grid-rows-[auto_1fr] overflow-hidden sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Providers</DialogTitle>
          <DialogDescription>
            Bring your own keys. Each is stored in a secure cookie and never
            exposed to the browser.
          </DialogDescription>
        </DialogHeader>

        {/* The three sections can outgrow the viewport; scroll them, not the
            dialog. Negative margin + padding keeps input focus rings from
            being clipped by the overflow. */}
        <div className="-mx-1 space-y-4 overflow-y-auto px-1">
          <HfTokenSection onClose={onClose} />
          <Separator />
          <ConnectionSection
            title="Chat provider"
            purpose="for chat · optional"
            // Signpost rather than silence: a hosted visitor can't use Ollama,
            // but telling them it works locally is how a local-first user learns
            // running Forge themselves is worth doing.
            blurb={
              allowLocal
                ? "Chat against your own OpenAI-compatible model — a local Ollama, or a proprietary model as a baseline. Or just pick a Hugging Face model above."
                : "Chat against your own OpenAI-compatible model, or just pick a Hugging Face model above. Local providers like Ollama only work when you run Forge on your own machine."
            }
            allowLocal={allowLocal}
            hasProvider={chat.hasProvider}
            storedBaseURL={chat.baseURL}
            storedModelId={chat.modelId}
            onSave={chat.save}
            onClear={chat.clear}
          />
          <Separator />
          <ConnectionSection
            title="Codegen provider"
            purpose="for playgrounds · optional"
            blurb="The AI that writes playground UIs. Any OpenAI-compatible endpoint. Your first few playgrounds are on us — bring a key to keep building."
            allowLocal={allowLocal}
            hasProvider={codegen.hasProvider}
            storedBaseURL={codegen.baseURL}
            storedModelId={codegen.modelId}
            onSave={codegen.save}
            onClear={codegen.clear}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Chat via the HF router — strict BYO: without a token, cloud chat 401s. */
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
        Cloud chat via the HF router, billed to your account. Local models need
        no token.
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

interface ConnectionSectionProps {
  title: string;
  purpose: string;
  blurb: string;
  /** False on a hosted deploy, where a localhost endpoint is unreachable. */
  allowLocal: boolean;
  hasProvider: boolean | null;
  storedBaseURL: string | null;
  storedModelId: string | null;
  onSave: (conn: {
    baseURL: string;
    apiKey: string;
    modelId: string;
  }) => Promise<void>;
  onClear: () => Promise<void>;
}

/** An OpenAI-compatible connection — the shared shape for chat and codegen. */
function ConnectionSection({
  title,
  purpose,
  blurb,
  allowLocal,
  hasProvider,
  storedBaseURL,
  storedModelId,
  onSave,
  onClear,
}: ConnectionSectionProps) {
  const [baseURL, setBaseURL] = React.useState("");
  const [modelId, setModelId] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [localModels, setLocalModels] = React.useState<string[]>([]);
  const listId = React.useId();

  // Don't offer what can't work: a localhost preset on a hosted page is a trap
  // that ends in a CORS/Private-Network failure the user can't fix.
  const presets = React.useMemo(
    () =>
      allowLocal
        ? PROVIDER_PRESETS
        : PROVIDER_PRESETS.filter((p) => !isLocalBaseURL(p.baseURL)),
    [allowLocal]
  );

  // Prefill from what's stored, else the first (Groq) preset.
  React.useEffect(() => {
    const preset = presets[0];
    setBaseURL(storedBaseURL ?? preset.baseURL);
    setModelId(storedModelId ?? preset.defaultModelId);
  }, [storedBaseURL, storedModelId, presets]);

  const activePreset = presets.find((p) => p.baseURL === baseURL);
  // A local endpoint (Ollama) needs no key — don't require one to save.
  const local = isLocalBaseURL(baseURL);

  // Discover installed models for a LOCAL endpoint (the server can't reach the
  // user's localhost, but the browser can). Seed the field with a real installed
  // model so the blind preset default can't cause a "model not found" on first
  // use. Debounced against base-URL typing; auth isn't needed for Ollama.
  React.useEffect(() => {
    if (!allowLocal || !local || !baseURL) {
      setLocalModels([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const ids = await listLocalModels(baseURL, "");
      if (cancelled) return;
      setLocalModels(ids);
      if (ids.length > 0) {
        // Keep a valid choice; replace a not-installed id (e.g. the preset
        // default) with the first installed one.
        setModelId((prev) => (ids.includes(prev) ? prev : ids[0]));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [allowLocal, local, baseURL]);
  const canSave =
    Boolean(baseURL.trim()) &&
    Boolean(modelId.trim()) &&
    (local || Boolean(apiKey.trim()));

  const applyPreset = (value: string) => {
    const preset = presets.find((p) => p.baseURL === value);
    if (!preset) return;
    setBaseURL(preset.baseURL);
    setModelId(preset.defaultModelId);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        baseURL: baseURL.trim(),
        apiKey: apiKey.trim(),
        modelId: modelId.trim(),
      });
      setApiKey("");
      toast.success(`${title} saved`);
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
        <h3 className="text-sm font-medium">{title}</h3>
        <StatusDot on={hasProvider} />
        <span className="ml-auto text-xs text-muted-foreground">{purpose}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>

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
            "h-7 w-full rounded-md border border-input bg-input/20 px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30",
          )}
        >
          {!activePreset && <option value="">Custom</option>}
          {presets.map((p) => (
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
          placeholder={
            local && localModels.length ? "pick or type a model" : "model id"
          }
          autoComplete="off"
          spellCheck={false}
          list={localModels.length ? listId : undefined}
        />
        {localModels.length > 0 && (
          <datalist id={listId}>
            {localModels.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        )}
        <div className="flex gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={local ? "no key needed" : "API key"}
            autoComplete="off"
          />
          {hasProvider && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void onClear()}
            >
              Remove
            </Button>
          )}
          <Button type="submit" disabled={!canSave || saving}>
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
        on ? "bg-emerald-500" : "bg-muted-foreground/40",
      )}
    />
  );
}
