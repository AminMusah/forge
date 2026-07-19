import { ImageResponse } from "next/og";

/**
 * The link preview card, generated at build time rather than maintained as a
 * binary. Every channel Forge gets shared through is link-driven, and a bare URL
 * with no card converts noticeably worse than one with a title and a claim.
 *
 * Satori (what ImageResponse renders with) supports a subset of CSS: flexbox
 * only, and any element with more than one child needs an explicit display.
 */

export const alt = "Forge — test open models without the setup";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
        <div style={{ display: "flex", fontSize: 108, fontWeight: 700, letterSpacing: "-0.03em" }}>
          Forge
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 46,
            color: "rgba(255,255,255,0.82)",
          }}
        >
          Test open models without the setup.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 30,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          Hugging Face models on your GPU, in the browser · modelplayground.dev
        </div>
      </div>
    ),
    size
  );
}
