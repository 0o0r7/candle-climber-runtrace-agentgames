import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN } from "@/lib/public-origin";

// Static sitemap — the surface is small and fully known. /stats and /ops are
// intentionally excluded (per-device local data / internal ops dashboard).
// The origin is this build's own deployment, never the other ecosystem's site.
const BASE = PUBLIC_ORIGIN;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, priority: 1.0 },
    { url: `${BASE}/play`, priority: 0.9 },
    { url: `${BASE}/leaderboard`, priority: 0.7 },
    { url: `${BASE}/partners`, priority: 0.8 },
    { url: `${BASE}/airdrop`, priority: 0.5 },
    { url: `${BASE}/privacy`, priority: 0.3 },
    { url: `${BASE}/terms`, priority: 0.3 },
  ];
}
