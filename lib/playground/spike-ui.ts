import { FORGE_SDK_SOURCE } from "@/lib/playground/bridge";

/**
 * Cut-1 spike: a HAND-WRITTEN object-detection playground, no codegen agent yet.
 * Its only job is to prove the plumbing end-to-end — a sandboxed iframe reads an
 * image, calls `forge.run()`, and draws the boxes the warm worker sends back.
 * Plain HTML/JS on purpose: this isolates the bridge + worker from esbuild-wasm
 * and React, which are the next, lower-risk layer.
 *
 * This is throwaway. The real thing is the agent generating this from the
 * object-detection descriptor.
 */
export function buildSpikeSrcdoc(): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8" />
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 14px system-ui, sans-serif; background: #0b0b0c; color: #e7e7e9; padding: 16px; }
  .row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  #status { color: #9a9aa2; }
  canvas { max-width: 100%; border: 1px solid #26262b; border-radius: 8px; display: block; }
  input[type=file] { color: #9a9aa2; }
</style>
</head>
<body>
  <div class="row">
    <input id="file" type="file" accept="image/*" />
    <span id="status">Drop an image to detect objects.</span>
  </div>
  <canvas id="canvas" width="1" height="1"></canvas>

  <script>${FORGE_SDK_SOURCE}</script>
  <script>
    const fileInput = document.getElementById("file");
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const status = document.getElementById("status");
    const COLORS = ["#4ade80","#60a5fa","#f472b6","#fbbf24","#a78bfa","#f87171"];

    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => run(String(reader.result));
      reader.readAsDataURL(file);
    });

    async function run(dataUrl) {
      const img = new Image();
      img.onload = async () => {
        const scale = Math.min(1, 720 / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        canvas.width = w; canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        status.textContent = "Running…";
        try {
          const out = await forge.run(
            { image: dataUrl, options: { threshold: 0.5 } },
            (t) => { status.textContent = t; }
          );
          drawBoxes(out || [], scale);
          status.textContent = (out ? out.length : 0) + " object(s) detected";
        } catch (e) {
          status.textContent = "Error: " + (e && e.message ? e.message : e);
        }
      };
      img.src = dataUrl;
    }

    function drawBoxes(items, scale) {
      ctx.lineWidth = 2;
      ctx.font = "13px system-ui, sans-serif";
      ctx.textBaseline = "top";
      items.forEach((item, i) => {
        const c = COLORS[i % COLORS.length];
        const b = item.box;
        const x = b.xmin * scale, y = b.ymin * scale;
        const bw = (b.xmax - b.xmin) * scale, bh = (b.ymax - b.ymin) * scale;
        ctx.strokeStyle = c;
        ctx.strokeRect(x, y, bw, bh);
        const label = item.label + " " + Math.round(item.score * 100) + "%";
        const tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = c;
        ctx.fillRect(x, Math.max(0, y - 18), tw, 18);
        ctx.fillStyle = "#0b0b0c";
        ctx.fillText(label, x + 4, Math.max(0, y - 18) + 2);
      });
    }
  </script>
</body>
</html>`;
}
