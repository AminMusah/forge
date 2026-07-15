"use client";

import * as React from "react";

import { compilePlayground } from "@/lib/playground/compile";
import { installPlaygroundBridge } from "@/lib/playground/bridge";
import { requestPlayground } from "@/lib/playground/codegen-client";
import { buildReactSrcdoc } from "@/lib/playground/react-spike-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Cut-2 slice 2: the iteration loop. Generate → Modify (edit from a prompt) →
 * Regenerate (fresh), with BOUNDED AUTO-FIX — a compile failure is fed back to
 * the model up to twice before it's surfaced, so trivial breakage self-heals but
 * a stubborn one doesn't silently burn codegen calls. Every result is a
 * revertable version.
 *
 * Still the throwaway spike harness; this is the behaviour PlaygroundView will
 * host once folded into the app.
 */
const TASK = "object-detection";
const MAX_FIX = 2;

interface Version {
  code: string;
  /** null when the version never compiled — inspectable but not runnable. */
  srcdoc: string | null;
  label: string;
}

const DEFAULT_REQUEST =
  "Test this object detection model — let me drag and drop an image and see the detected objects drawn on it.";

export default function SpikePlaygroundPage() {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [request, setRequest] = React.useState(DEFAULT_REQUEST);
  const [instruction, setInstruction] = React.useState("");

  const [versions, setVersions] = React.useState<Version[]>([]);
  const [current, setCurrent] = React.useState(-1);
  const [srcdoc, setSrcdoc] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const currentCode = current >= 0 ? versions[current]?.code : undefined;

  const addVersion = (v: Version) => {
    setVersions((vs) => {
      const next = [...vs, v];
      // Same value on a StrictMode double-invoke, so this stays safe.
      setCurrent(next.length - 1);
      return next;
    });
    setSrcdoc(v.srcdoc);
  };

  /** Compile; on failure, ask the model to fix it, up to MAX_FIX times. */
  const settle = async (fresh: string, label: string) => {
    let code = fresh;
    for (let attempt = 0; ; attempt++) {
      try {
        setStatus(attempt ? `Compiling fix ${attempt}/${MAX_FIX}…` : "Compiling…");
        const doc = buildReactSrcdoc(await compilePlayground(code));
        addVersion({ code, srcdoc: doc, label: attempt ? `${label} · auto-fixed` : label });
        setStatus(null);
        return;
      } catch (compileError) {
        const message =
          compileError instanceof Error ? compileError.message : String(compileError);
        if (attempt >= MAX_FIX) {
          addVersion({ code, srcdoc: null, label: `${label} · won't compile` });
          setError(`Still failing after ${MAX_FIX} fixes: ${message}`);
          setStatus(null);
          return;
        }
        setStatus(`Auto-fixing compile error (${attempt + 1}/${MAX_FIX})…`);
        code = await requestPlayground({
          task: TASK,
          previousCode: code,
          instruction: `The code failed to compile with this error:\n${message}\n\nReturn the corrected full file.`,
        });
      }
    }
  };

  const run = async (
    body: Parameters<typeof requestPlayground>[0],
    label: string
  ) => {
    setBusy(true);
    setError(null);
    try {
      setStatus("Generating…");
      await settle(await requestPlayground(body), label);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const generate = () => run({ task: TASK, request }, "Generated");
  const regenerate = () => run({ task: TASK, request }, "Regenerated");
  const modify = () => {
    if (!currentCode || !instruction.trim()) return;
    const change = instruction.trim();
    setInstruction("");
    void run({ task: TASK, previousCode: currentCode, instruction: change }, `Modify: ${change}`);
  };

  const revert = (i: number) => {
    setCurrent(i);
    setSrcdoc(versions[i].srcdoc);
    setError(null);
  };

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !srcdoc) return;
    return installPlaygroundBridge(iframe, {
      task: "object-detection",
      modelId: "Xenova/detr-resnet-50",
      dtype: "q4",
    });
  }, [srcdoc]);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3 overflow-y-auto px-4 py-6">
      <div>
        <h1 className="text-lg font-semibold">Playground spike · iteration loop</h1>
        <p className="text-sm text-muted-foreground">
          Generate, modify by prompt, or regenerate. Compile failures auto-fix up
          to {MAX_FIX}× before surfacing. Every result is a revertable version.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={2}
          placeholder="Describe the playground to build…"
          className="w-full resize-none rounded-lg border bg-card p-2 text-sm outline-none focus:border-ring"
        />
        <div className="flex gap-2">
          <Button onClick={generate} disabled={busy} className="self-start">
            {busy ? "Working…" : "Generate"}
          </Button>
          {versions.length > 0 && (
            <Button variant="outline" onClick={regenerate} disabled={busy}>
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {versions.length > 0 && (
        <div className="flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && modify()}
            disabled={busy}
            placeholder="Modify: e.g. make the boxes red, show a count…"
            className="min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm outline-none focus:border-ring"
          />
          <Button variant="outline" onClick={modify} disabled={busy || !instruction.trim()}>
            Modify
          </Button>
        </div>
      )}

      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {versions.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {versions.map((v, i) => (
            <button
              key={i}
              onClick={() => revert(i)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                i === current
                  ? "border-ring bg-muted"
                  : "text-muted-foreground hover:bg-muted/50",
                v.srcdoc === null && "border-destructive/40 text-destructive"
              )}
              title={v.label}
            >
              v{i + 1}
            </button>
          ))}
        </div>
      )}

      {srcdoc && (
        <iframe
          ref={iframeRef}
          srcDoc={srcdoc}
          sandbox="allow-scripts"
          className="min-h-80 w-full flex-1 rounded-lg border bg-card"
          title="Generated playground"
        />
      )}

      {currentCode && (
        <details className="rounded-lg border bg-card p-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {versions[current]?.label} · {currentCode.split("\n").length} lines
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap">
            {currentCode}
          </pre>
        </details>
      )}
    </div>
  );
}
