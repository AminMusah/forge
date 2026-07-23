"use client";

import * as React from "react";
import { ArrowsRotate, Share } from "reicon-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CodeBlock } from "@/components/chat/code-block";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { installPlaygroundBridge } from "@/lib/playground/bridge";
import { CodegenError, requestPlayground } from "@/lib/playground/codegen-client";
import { useCodegenProviderStore } from "@/hooks/use-codegen-provider-store";
import { useModal } from "@/hooks/use-modal-store";
import { useModelPerfStore } from "@/hooks/use-model-perf-store";
import { useTokenStore } from "@/hooks/use-token-store";
import { compilePlayground } from "@/lib/playground/compile";
import { buildPlaygroundSrcdoc } from "@/lib/playground/iframe";
import { buildSharePath } from "@/lib/playground/share";
import { DEFAULT_DTYPE } from "@/lib/model-cache";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The generated-playground surface, and the whole point of the pivot: instead of
 * a hand-built view per task, ONE component hosts a UI the agent writes from the
 * task's descriptor. A playground IS a Chat — user turns are the request/modify
 * prompts, assistant turns are generated UI versions — so recents, search,
 * rename, delete and persistence all come from the store unchanged.
 *
 * The generated code is kilobytes of text, so it persists in the store and a
 * playground survives a reload (unlike the audio surfaces, whose bytes we strip).
 *
 * Only mounted once the chat store has hydrated — see ChatPage.
 */
const MAX_FIX = 2;

const message = (role: ChatMessage["role"], content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
});

export function PlaygroundView({ chatId }: { chatId: string }) {
  const exists = useChatStore((s) => s.chats.some((c) => c.id === chatId));
  const modelId = useChatStore(
    (s) => s.chats.find((c) => c.id === chatId)?.modelId
  );
  const messages = useChatStore(
    (s) => s.chats.find((c) => c.id === chatId)?.messages ?? EMPTY
  );

  const model = useModelStore((s) => s.models.find((m) => m.id === modelId));

  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const compiled = React.useRef(new Map<string, string>());
  const abortRef = React.useRef<AbortController | null>(null);

  const [current, setCurrent] = React.useState<string | null>(null);
  const [srcdoc, setSrcdoc] = React.useState<string | null>(null);
  const [instruction, setInstruction] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [compiling, setCompiling] = React.useState(false);
  const [showCode, setShowCode] = React.useState(false);
  /** The free allowance ran out (402). Retrying can't fix it; a key can. */
  const [exhausted, setExhausted] = React.useState(false);

  const { onOpen } = useModal();
  const perf = useModelPerfStore((s) => (model ? s.stats[model.id] : undefined));
  const hasCodegenProvider = useCodegenProviderStore((s) => s.hasProvider);
  const hasToken = useTokenStore((s) => s.hasToken);
  // Self-healing: saving a codegen connection OR an HF token lifts the block —
  // both now unlock codegen, so either flipping true means "you're past the wall".
  const blocked = exhausted && !hasCodegenProvider && !hasToken;

  const versions = React.useMemo(
    () => messages.filter((m) => m.role === "assistant"),
    [messages]
  );
  const firstRequest = messages.find((m) => m.role === "user")?.content ?? "";
  const currentCode = versions.find((v) => v.id === current)?.content ?? "";

  // Keep the model chip describing this chat.
  React.useEffect(() => {
    const { models, setModel } = useModelStore.getState();
    const m = models.find((x) => x.id === modelId);
    if (m) setModel(m);
  }, [modelId]);

  /** Append turns to the chat — the store gives recency, search and persistence. */
  const appendTurns = React.useCallback(
    (turns: ChatMessage[]) => {
      const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
      if (!chat) return;
      useChatStore.getState().syncMessages(chatId, [...chat.messages, ...turns]);
    },
    [chatId]
  );

  /** Compile; on failure, feed the error back to the model up to MAX_FIX times. */
  const settle = React.useCallback(
    async (task: string, fresh: string, signal: AbortSignal): Promise<string> => {
      let code = fresh;
      for (let attempt = 0; ; attempt++) {
        try {
          setStatus(attempt ? `Compiling fix ${attempt}/${MAX_FIX}…` : "Compiling…");
          await compilePlayground(code); // throws on failure
          return code;
        } catch (compileError) {
          const msg =
            compileError instanceof Error ? compileError.message : String(compileError);
          if (attempt >= MAX_FIX) throw new Error(`Still failing after ${MAX_FIX} fixes: ${msg}`);
          setStatus(`Auto-fixing compile error (${attempt + 1}/${MAX_FIX})…`);
          code = await requestPlayground(
            {
              task,
              previousCode: code,
              instruction: `The code failed to compile with this error:\n${msg}\n\nReturn the corrected full file.`,
            },
            signal
          );
        }
      }
    },
    []
  );

  const run = React.useCallback(
    async (
      body: Parameters<typeof requestPlayground>[0],
      userTurn: string | null,
      // The auto-generate effect passes its own controller so its cleanup can
      // abort — user-triggered runs (regenerate/modify) mint one here instead.
      controller?: AbortController
    ) => {
      if (!model) return;
      const ctrl = controller ?? new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      setError(null);
      try {
        setStatus("Generating playground…");
        const fresh = await requestPlayground(body, ctrl.signal);
        const code = await settle(model.task, fresh, ctrl.signal);
        const assistant = message("assistant", code);
        appendTurns(
          userTurn ? [message("user", userTurn), assistant] : [assistant]
        );
        setCurrent(assistant.id);
        setExhausted(false);
      } catch (e) {
        // A newer run already owns the UI (StrictMode's dev remount restarts this
        // effect, so the aborted first run rejects LATE) — don't clobber it with
        // this superseded run's "Stopped".
        if (abortRef.current !== ctrl) return;
        // Stop leaves the previous version intact — not an error.
        if (ctrl.signal.aborted) setStatus("Stopped");
        else {
          // 402 is the one failure retrying can never clear — record it so the
          // controls can offer the fix instead of a button doomed to repeat.
          if (e instanceof CodegenError && e.status === 402) setExhausted(true);
          setError(e instanceof Error ? e.message : String(e));
          setStatus(null);
        }
      } finally {
        // Only the current run resets the shared UI state; a superseded one
        // must not flip busy off or null the live controller.
        if (abortRef.current === ctrl) {
          setBusy(false);
          abortRef.current = null;
        }
      }
    },
    [model, settle, appendTurns]
  );

  const stop = () => abortRef.current?.abort();

  // Generate the first version when a freshly-created playground has none yet.
  // Not on reload: a chat that already has a version just compiles it below.
  // The effect OWNS the abort (rather than a startedRef latch) so it survives
  // React StrictMode's dev remount — the cleanup aborts, the re-run restarts —
  // and a real navigation cancels the in-flight generation.
  React.useEffect(() => {
    if (versions.length > 0 || !firstRequest || !model) return;
    const controller = new AbortController();
    void run({ task: model.task, request: firstRequest }, null, controller);
    return () => controller.abort();
  }, [versions.length, firstRequest, model, run]);

  // Default the view to the latest version once one exists.
  React.useEffect(() => {
    if (current === null && versions.length > 0) {
      setCurrent(versions[versions.length - 1].id);
    }
  }, [current, versions]);

  // Compile whatever version is being viewed (cached per version id, so reverting
  // is instant and a reload recompiles the stored code once).
  React.useEffect(() => {
    const version = versions.find((v) => v.id === current);
    if (!version) return;

    const cachedDoc = compiled.current.get(version.id);
    if (cachedDoc) {
      setSrcdoc(cachedDoc);
      return;
    }

    let cancelled = false;
    setCompiling(true);
    setStatus("Compiling…");
    void compilePlayground(version.content)
      .then((js) => {
        if (cancelled) return;
        const doc = buildPlaygroundSrcdoc(js);
        compiled.current.set(version.id, doc);
        setSrcdoc(doc);
        setStatus(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setCompiling(false);
      });
    return () => {
      cancelled = true;
    };
  }, [current, versions]);

  // Proxy the iframe's forge.run() calls to the warm worker.
  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !srcdoc || !model) return;
    return installPlaygroundBridge(iframe, {
      task: model.task,
      modelId: model.id,
      dtype: model.dtype ?? DEFAULT_DTYPE,
    });
  }, [srcdoc, model]);

  // Leaving mid-generation must cancel the work, not just look like it did: the
  // request and its auto-fix follow-ups keep billing the provider otherwise, and
  // appendTurns would write versions into a chat the user has already left.
  // run()'s catch already treats an aborted signal as "Stopped", not an error.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const modify = () => {
    const change = instruction.trim();
    const code = versions.find((v) => v.id === current)?.content;
    // Guard model here, not just in run(): `model!.task` is evaluated at this
    // call site, so an unknown pinned model threw a TypeError before run()'s own
    // guard could no-op. The catalog legitimately may not hold it.
    if (!model || !change || !code) return;
    setInstruction("");
    void run({ task: model.task, previousCode: code, instruction: change }, change);
  };

  const regenerate = () => {
    if (!model || !firstRequest) return;
    void run({ task: model.task, request: firstRequest }, null);
  };

  /** Compress the current version into a `/p` link and copy it — the whole
   *  point of the growth loop, so it never touches a server. */
  const share = React.useCallback(async () => {
    if (!model || !currentCode) return;
    try {
      const path = await buildSharePath({
        code: currentCode,
        task: model.task,
        modelId: model.id,
        dtype: model.dtype ?? DEFAULT_DTYPE,
      });
      await navigator.clipboard.writeText(window.location.origin + path);
      toast.success("Share link copied");
    } catch {
      toast.error("Couldn't create a share link");
    }
  }, [model, currentCode]);

  if (!exists) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-lg font-semibold">Playground not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been deleted. Start a new one from the sidebar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-2 px-4 py-4">
        {versions.length >= 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {versions.length > 1 &&
              versions.map((v, i) => (
                <button
                  key={v.id}
                  onClick={() => setCurrent(v.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    v.id === current
                      ? "border-ring bg-muted"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  v{i + 1}
                </button>
              ))}
            {/* What the model costs on THIS machine. Only appears once it has
                actually run — the playground's own UI decides when that is. */}
            {perf && (perf.loadMs > 0 || perf.inferenceMs > 0) && (
              <span className="ml-auto text-xs text-muted-foreground">
                {perf.loadMs > 0 && `loaded ${(perf.loadMs / 1000).toFixed(1)}s`}
                {perf.loadMs > 0 && perf.inferenceMs > 0 && " · "}
                {perf.inferenceMs > 0 && `last run ${Math.round(perf.inferenceMs)}ms`}
              </span>
            )}
            {/* View the generated TSX itself — copy it, hand it to someone, or
                just see what the model wrote when a playground misbehaves. */}
            <button
              onClick={() => setShowCode((s) => !s)}
              disabled={!currentCode}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-40",
                // Only claim the spacer when the perf readout hasn't.
                !(perf && (perf.loadMs > 0 || perf.inferenceMs > 0)) && "ml-auto"
              )}
            >
              {showCode ? "Preview" : "Code"}
            </button>
            {/* Regenerate re-runs the ORIGINAL prompt for a fresh version — no
                new input, so it lives here by the versions, not in the composer. */}
            <button
              onClick={regenerate}
              disabled={busy || !firstRequest || blocked}
              title="Regenerate from the original prompt"
              aria-label="Regenerate"
              className="inline-flex items-center rounded-full border p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowsRotate className="size-3.5" />
            </button>
            {/* Copies a self-contained /p link — the code lives in the URL
                fragment, so Forge never sees it. */}
            <button
              onClick={() => void share()}
              disabled={!currentCode}
              title="Copy a shareable link"
              aria-label="Share"
              className="inline-flex items-center rounded-full border p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-40"
            >
              <Share className="size-3.5" />
            </button>
          </div>
        )}

        {/* Errors always show; live status shows here only when a playground is
            already on screen (e.g. regenerating) — otherwise the box below owns
            the "working…" message, so they don't say two different things. */}
        {blocked ? (
          // A dead end deserves the way out, not a reason. Stated next to the
          // disabled controls rather than in a title tooltip: a disabled button
          // swallows its own tooltip, so the explanation has to be visible.
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
            <p className="text-sm text-muted-foreground">
              You&apos;ve used your free playgrounds. Add your Hugging Face token —
              it powers cloud chat and unlimited codegen, on your own account.
            </p>
            <Button size="sm" className="ml-auto" onClick={() => onOpen("providers")}>
              Add your Hugging Face token
            </Button>
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : status && srcdoc ? (
          <p className="text-sm text-muted-foreground">{status}</p>
        ) : null}

        {/* Both panels stay MOUNTED and swap visibility rather than swapping
            places. Unmounting the iframe to read the source tore the running
            playground down with it — an uploaded image, a recording, a result,
            all gone on the way back — and remounting CodeBlock re-paid Shiki's
            first-use cost every time. Mounted early, it warms while you're
            still looking at the preview. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {currentCode && (
            <div className={cn(!showCode && "hidden")}>
              <CodeBlock code={currentCode} language="tsx" />
            </div>
          )}
          <div className={cn("h-full", showCode && "hidden")}>
            {srcdoc ? (
              <iframe
                ref={iframeRef}
                srcDoc={srcdoc}
                sandbox="allow-scripts"
                className="h-full min-h-80 w-full rounded-lg border bg-card"
                title="Generated playground"
              />
            ) : (
              <div className="flex h-full items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
                {/* Spinner ONLY while actually working — generating, compiling, or a
                    stored version not yet rendered. A terminal status ("Stopped") or
                    an error must NOT spin, and a version compiling on load is not
                    "no playground" (that copy read as broken). */}
                {(busy || compiling || versions.length > 0) && !error ? (
                  <>
                    <Spinner className="size-4" />
                    <span>{status ?? "Loading playground…"}</span>
                  </>
                ) : error ? (
                  <span>Couldn&apos;t render this playground — see the error above.</span>
                ) : status ? (
                  <span>{status}</span>
                ) : (
                  <span>No playground yet.</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        <div className="flex items-center gap-2 rounded-[18px] border bg-card p-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && modify()}
            disabled={busy || blocked}
            placeholder={
              blocked
                ? "Add your Hugging Face token to keep editing"
                : "Change the playground — e.g. make the boxes red, show a count…"
            }
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          {busy ? (
            <Button variant="outline" size="sm" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={modify}
              disabled={!instruction.trim() || blocked}
            >
              Modify
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY: ChatMessage[] = [];
