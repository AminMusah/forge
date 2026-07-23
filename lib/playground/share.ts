/**
 * Encode/decode a playground into a shareable URL. The whole payload lives in the
 * URL FRAGMENT (after #), which the browser never sends to a server — so shared
 * code is seen only by the recipient's browser, and Forge hosts nothing. task +
 * model are ALSO copied into the query string, purely so a link-preview crawler
 * can read them (plan 004); the client ignores the query and trusts the fragment.
 */
export interface SharePayload {
  v: 1;
  code: string;
  task: string;
  modelId: string;
  dtype: string;
}

// Pinned to the ArrayBuffer-backed variant (not the wider ArrayBufferLike that
// SharedArrayBuffer also satisfies) — that's what Blob's BlobPart accepts.
function toBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deflate(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const cs = new CompressionStream("deflate-raw");
  const stream = new Response(new Blob([text]).stream().pipeThrough(cs));
  return new Uint8Array(await stream.arrayBuffer());
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return stream.text();
}

/** Returns `/p?task=…&model=…#<compressed>` (origin added by caller). */
export async function buildSharePath(p: Omit<SharePayload, "v">): Promise<string> {
  const payload: SharePayload = { v: 1, ...p };
  const frag = toBase64Url(await deflate(JSON.stringify(payload)));
  const q = new URLSearchParams({ task: p.task, model: p.modelId });
  return `/p?${q.toString()}#${frag}`;
}

/** Parse the fragment back into a payload, or null if invalid. */
export async function parseShareFragment(fragment: string): Promise<SharePayload | null> {
  const frag = fragment.replace(/^#/, "");
  if (!frag) return null;
  try {
    const json = await inflate(fromBase64Url(frag));
    const p = JSON.parse(json) as Partial<SharePayload>;
    if (
      p.v === 1 &&
      typeof p.code === "string" &&
      p.code &&
      typeof p.task === "string" &&
      typeof p.modelId === "string" &&
      typeof p.dtype === "string"
    ) {
      return p as SharePayload;
    }
  } catch {
    // Malformed fragment — treat like any other broken link.
  }
  return null;
}
