// Single source of truth for THIS build's public origin.
//
// Identity boundary: the original Candle Climber game was deployed for the
// vibe/vibe (Robinhood Chain) ecosystem at a different address. This RunTrace /
// Agent Games build is a separate deployment with its own address, and nothing
// here may generate a link back to that other site. Set NEXT_PUBLIC_SITE_URL on
// the deployment; the fallback is this build's own Vercel project URL.
export const DEFAULT_PUBLIC_ORIGIN = "https://candle-climber-runtrace.vercel.app";

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

export const PUBLIC_ORIGIN = normalizeOrigin(
  process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_PUBLIC_ORIGIN,
);

/** Absolute URL on this build's own origin. */
export function publicUrl(path: string): string {
  return `${PUBLIC_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
