"use client";

import * as React from "react";

import { compilePlayground } from "@/lib/playground/compile";
import { installPlaygroundBridge } from "@/lib/playground/bridge";
import {
  REACT_PLAYGROUND_TSX,
  buildReactSrcdoc,
} from "@/lib/playground/react-spike-ui";

/**
 * Cut-1 slice 2: prove the REAL rendering path. A React playground is compiled
 * in-browser by esbuild-wasm (in this parent page), injected into a sandboxed
 * iframe, and calls the local model through the forge bridge. Same visible result
 * as slice 1's hand-written UI — boxes on an image — but now via the pipeline the
 * codegen agent will target.
 *
 * Unlinked throwaway at /spike/playground.
 */
export default function SpikePlaygroundPage() {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [srcdoc, setSrcdoc] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Compile the TSX once, in the parent, with esbuild-wasm.
  React.useEffect(() => {
    let cancelled = false;
    compilePlayground(REACT_PLAYGROUND_TSX)
      .then((js) => {
        if (!cancelled) setSrcdoc(buildReactSrcdoc(js));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Once the iframe is mounted (srcdoc ready), proxy its forge.run() calls.
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
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3 px-4 py-6">
      <div>
        <h1 className="text-lg font-semibold">
          Playground spike · esbuild-wasm + React
        </h1>
        <p className="text-sm text-muted-foreground">
          React TSX compiled in your browser, running in a sandboxed iframe,
          calling detr-resnet-50 through the forge bridge.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Compile failed: {error}
        </p>
      ) : !srcdoc ? (
        <p className="text-sm text-muted-foreground">Compiling playground…</p>
      ) : (
        <iframe
          ref={iframeRef}
          srcDoc={srcdoc}
          // allow-scripts only: opaque origin, can't reach our cookies/DOM — it
          // only postMessages, which is all the bridge needs.
          sandbox="allow-scripts"
          className="min-h-0 w-full flex-1 rounded-lg border bg-card"
          title="Object detection playground"
        />
      )}
    </div>
  );
}
