import { ImageResponse } from "next/og";
import { taskLabel } from "@/lib/hf-tasks";

/**
 * Per-share link preview card, served from a plain Route Handler rather than
 * the app/p/opengraph-image convention: Next 16.2.10 prerenders a
 * route-segment `opengraph-image` once at build time and ignores request-time
 * searchParams (verified — identical bytes came back for every query
 * string), so a route handler that reads `req.url` directly is the only way
 * to make the card match the specific shared playground (task/model, the
 * non-secret facts plan 003 copies out of the URL fragment).
 */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const task = searchParams.get("task") ?? undefined;
  const model = searchParams.get("model") ?? undefined;
  const modelName = model?.split("/").pop() ?? "a model";
  const label = task ? taskLabel(task) : "Playground";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#123524",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", fontSize: 88, fontWeight: 700, letterSpacing: "-0.03em" }}>
          {label}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 46,
            color: "rgba(255,255,255,0.82)",
          }}
        >
          {modelName}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 30,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          Run it in your browser · Forge
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
