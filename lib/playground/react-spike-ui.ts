import { FORGE_SDK_SOURCE } from "@/lib/playground/bridge";

/**
 * Cut-1 slice 2: the SAME object-detection playground as the hand-written spike,
 * but as REACT TSX — to prove esbuild-wasm compiles it in-browser and it runs in
 * the sandboxed iframe against the forge bridge. This is the rendering path the
 * codegen agent will actually target (the agent writes TSX like this).
 *
 * Boxes are positioned as % of the natural image size, so they need no measured
 * layout — they track the image at any display width.
 */
export const REACT_PLAYGROUND_TSX = `
import { useState } from "react";
import { createRoot } from "react-dom/client";

function pct(n) { return (n * 100) + "%"; }
const COLORS = ["#4ade80","#60a5fa","#f472b6","#fbbf24","#a78bfa","#f87171"];

function Playground() {
  const [src, setSrc] = useState(null);
  const [nat, setNat] = useState({ w: 1, h: 1 });
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("Drop an image to detect objects.");

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const dataUrl = await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });
    setItems([]); setSrc(dataUrl); setStatus("Running…");
    try {
      const out = await window.forge.run({ image: dataUrl, options: { threshold: 0.5 } }, setStatus);
      setItems(out || []);
      setStatus(((out && out.length) || 0) + " object(s) detected");
    } catch (err) {
      setStatus("Error: " + (err && err.message ? err.message : err));
    }
  }

  return (
    <div style={{ font: "14px system-ui, sans-serif" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <input type="file" accept="image/*" onChange={onFile} />
        <span style={{ color: "#9a9aa2" }}>{status}</span>
      </div>
      {src && (
        <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
          <img
            src={src}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ display: "block", maxWidth: "100%", borderRadius: 8 }}
          />
          {items.map((it, i) => {
            const c = COLORS[i % COLORS.length];
            return (
              <div key={i} style={{
                position: "absolute", boxSizing: "border-box", border: "2px solid " + c,
                left: pct(it.box.xmin / nat.w), top: pct(it.box.ymin / nat.h),
                width: pct((it.box.xmax - it.box.xmin) / nat.w),
                height: pct((it.box.ymax - it.box.ymin) / nat.h),
              }}>
                <span style={{
                  position: "absolute", top: -18, left: 0, background: c, color: "#0b0b0c",
                  fontSize: 12, padding: "0 4px", whiteSpace: "nowrap",
                }}>
                  {it.label} {Math.round(it.score * 100)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Playground />);
`;

/** The import map: bare specifiers → pinned esm.sh. `?external=react` keeps ONE
 *  react instance (react-dom importing its own copy causes "invalid hook call"). */
const IMPORT_MAP = {
  imports: {
    react: "https://esm.sh/react@19.2.4",
    "react/jsx-runtime": "https://esm.sh/react@19.2.4/jsx-runtime",
    "react-dom": "https://esm.sh/react-dom@19.2.4?external=react",
    "react-dom/client": "https://esm.sh/react-dom@19.2.4/client?external=react",
  },
};

/**
 * The iframe document: import map first, then the injected `forge` SDK (a classic
 * script, so `window.forge` is set before the deferred module runs), then the
 * compiled playground as a module. Nothing here is Forge-specific to detection —
 * only REACT_PLAYGROUND_TSX is; this shell is what every generated playground
 * will share.
 */
export function buildReactSrcdoc(compiledJs: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b0b0c; color: #e7e7e9; padding: 16px; font: 14px system-ui, sans-serif; }
</style>
</head>
<body>
<div id="root"></div>
<script>${FORGE_SDK_SOURCE}</script>
<script type="module">
${compiledJs}
</script>
</body>
</html>`;
}
