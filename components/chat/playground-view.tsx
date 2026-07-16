"use client";

import * as React from "react";
import { ArrowsRotate } from "reicon-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useChatStore } from "@/hooks/use-chat-store";
import { useModelStore } from "@/hooks/use-model-store";
import { installPlaygroundBridge } from "@/lib/playground/bridge";
import { requestPlayground } from "@/lib/playground/codegen-client";
import { compilePlayground } from "@/lib/playground/compile";
import { buildPlaygroundSrcdoc } from "@/lib/playground/iframe";
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
  const startedRef = React.useRef(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const [current, setCurrent] = React.useState<string | null>(null);
  const [srcdoc, setSrcdoc] = React.useState<string | null>(null);
  const [instruction, setInstruction] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const versions = React.useMemo(
    () => messages.filter((m) => m.role === "assistant"),
    [messages]
  );
  const firstRequest = messages.find((m) => m.role === "user")?.content ?? "";

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
      userTurn: string | null
    ) => {
      if (!model) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setError(null);
      try {
        setStatus("Generating…");
        const fresh = await requestPlayground(body, controller.signal);
        const code = await settle(model.task, fresh, controller.signal);
        const assistant = message("assistant", code);
        appendTurns(
          userTurn ? [message("user", userTurn), assistant] : [assistant]
        );
        setCurrent(assistant.id);
      } catch (e) {
        // Stop leaves the previous version intact — not an error.
        if (controller.signal.aborted) setStatus("Stopped");
        else {
          setError(e instanceof Error ? e.message : String(e));
          setStatus(null);
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [model, settle, appendTurns]
  );

  const stop = () => abortRef.current?.abort();

  // Generate the first version when a freshly-created playground has none yet.
  // Not on reload: a chat that already has a version just compiles it below.
  React.useEffect(() => {
    if (startedRef.current || versions.length > 0 || !firstRequest || !model) return;
    startedRef.current = true;
    void run({ task: model.task, request: firstRequest }, null);
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

  const modify = () => {
    const change = instruction.trim();
    const code = versions.find((v) => v.id === current)?.content;
    if (!change || !code) return;
    setInstruction("");
    void run({ task: model!.task, previousCode: code, instruction: change }, change);
  };

  const regenerate = () => {
    if (!model || !firstRequest) return;
    void run({ task: model.task, request: firstRequest }, null);
  };

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
            {/* Regenerate re-runs the ORIGINAL prompt for a fresh version — no
                new input, so it lives here by the versions, not in the composer. */}
            <button
              onClick={regenerate}
              disabled={busy || !firstRequest}
              title="Regenerate from the original prompt"
              aria-label="Regenerate"
              className="ml-auto inline-flex items-center rounded-full border p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowsRotate className="size-3.5" />
            </button>
          </div>
        )}

        {(status || error) && (
          <p
            className={cn(
              "text-sm",
              error ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {error ?? status}
          </p>
        )}

        <div className="min-h-0 flex-1">
          {srcdoc ? (
            <iframe
              ref={iframeRef}
              srcDoc={srcdoc}
              sandbox="allow-scripts"
              className="h-full min-h-80 w-full rounded-lg border bg-card"
              title="Generated playground"
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">
                {busy ? status ?? "Generating…" : "No playground yet."}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        <div className="flex items-center gap-2 rounded-[18px] border bg-card p-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && modify()}
            disabled={busy}
            placeholder="Change the playground — e.g. make the boxes red, show a count…"
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          {busy ? (
            <Button variant="outline" size="sm" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={modify} disabled={!instruction.trim()}>
              Modify
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY: ChatMessage[] = [];
