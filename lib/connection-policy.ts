import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Whether a user-supplied base URL may be fetched BY THIS SERVER.
 *
 * Server-only (node:dns), which is why it isn't in lib/connection.ts — that
 * module is isomorphic and the client imports isLocalBaseURL from it.
 *
 * Gated on a PRODUCTION build, which is what a real deployment is: Forge is
 * hosted at a public URL there, so this provider route becomes a fetch primitive
 * aimed at the operator's internal network from inside their trust boundary.
 * So on a deploy, private/loopback/link-local targets (cloud metadata at
 * 169.254.169.254 especially) are refused, and a localhost provider is rejected
 * because the local story on a deploy is the in-browser WebGPU model, not the
 * user's own Ollama. Running the repo locally (`next dev`) is development, where
 * pointing at your own machine IS the feature and nothing is blocked.
 */
export function isHostedDeploy(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Private, loopback, link-local and other non-routable space. */
function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = p;
    return (
      a === 0 || // "this network"
      a === 10 || // 10/8
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local (cloud metadata lives here)
      (a === 172 && b >= 16 && b <= 31) || // 172.16/12
      (a === 192 && b === 168) || // 192.168/16
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
      a >= 224 // multicast + reserved
    );
  }
  if (v === 6) {
    const ip6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (ip6 === "::1" || ip6 === "::") return true;
    // Unique-local fc00::/7 and link-local fe80::/10.
    if (/^f[cd]/.test(ip6) || /^fe[89ab]/.test(ip6)) return true;
    // IPv4-mapped (::ffff:10.0.0.1) — judge the embedded v4 address.
    const mapped = ip6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // Not an IP literal at all — caller resolves first.
}

/** One message for every refusal — see assertFetchableBaseURL. */
export const UNREACHABLE = "Couldn't verify that endpoint. Check the base URL.";

/**
 * Throws when the target isn't fetchable under the current policy. The scheme
 * check runs everywhere (zod's .url() accepts file:/ftp:, neither an
 * OpenAI-compatible endpoint); the private-range check runs only on a hosted
 * deploy. The message is deliberately generic: distinguishing "refused" from
 * "unreachable" would answer questions about the operator's network.
 */
export async function assertFetchableBaseURL(baseURL: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    throw new Error("That base URL isn't valid.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("That base URL isn't valid.");
  }

  if (!isHostedDeploy()) return;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error(UNREACHABLE);
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(UNREACHABLE);
  }
  if (addresses.length === 0) throw new Error(UNREACHABLE);
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error(UNREACHABLE);
  }
}

/**
 * A drop-in `fetch` that enforces the SSRF policy on the URL being requested,
 * every time — not just once at save. Two protections the raw fetch lacks:
 *
 *  - re-runs assertFetchableBaseURL on the ACTUAL url, so a connection that was
 *    clean when stored can't be re-pointed at an internal host afterwards, and
 *  - on a hosted deploy, refuses to FOLLOW a redirect: a public host that
 *    passed the check can still answer 3xx -> 169.254.169.254, which is how the
 *    one-shot check at save time gets defeated.
 *
 * Pass it as the `fetch` option to createOpenAICompatible, and use it directly
 * for the verify fetch. Local dev is unguarded on purpose (see
 * assertFetchableBaseURL) — pointing at your own machine is the feature there.
 */
export const fetchGuarded: typeof fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  await assertFetchableBaseURL(url);
  return fetch(input, {
    ...init,
    // "error" makes fetch THROW on any 3xx rather than follow it. Gated on a
    // hosted deploy so a local Ollama that legitimately redirects still works.
    redirect: isHostedDeploy() ? "error" : init?.redirect ?? "follow",
  });
};
