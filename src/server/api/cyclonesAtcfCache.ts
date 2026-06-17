// ── Cyclones ATCF cache ──────────────────────────────────────────────
// Per-storm cache of NHC ATCF data, lazy-fetched on demand and served to the
// client — same Map<stormId, CacheEntry> + TTL + stale-while-revalidate shape
// as cyclonesConeCache.ts.
//
// Currently parses the b-deck (best track, `btk/b<stormid>.dat`) for the
// CURRENT 34/50/64-kt wind radii per quadrant — real analyzed storm size, not
// an intensity guess. The a-deck (model guidance) for spaghetti plots will
// extend this module later.
//
// SSRF (OWASP A10): the stormId path param is validated against STORM_ID_RE
// (^(AL|EP|CP)\d{2}\d{4}$) before it reaches here, so interpolating it into the
// fixed NHC ATCF URL cannot escape the host/path.

import { fetchWithTimeout } from "../lib/fetchWithTimeout";
import { createPerKeyCache } from "../lib/perKeyCache";

const ATCF_BTK_BASE = "https://ftp.nhc.noaa.gov/atcf/btk";
const ATCF_CACHE_TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const PURGE_INTERVAL_MS = 10 * 60_000;

// ── Types ────────────────────────────────────────────────────────────

/** Current wind radii. Each `kt*` is nautical miles per quadrant
 *  [NE, SE, SW, NW], or null when NHC reports none at that threshold. */
export type WindRadii = {
  lat: number;
  lon: number;
  vmaxKt: number;
  validTime: string; // ATCF YYYYMMDDHH
  kt34: number[] | null;
  kt50: number[] | null;
  kt64: number[] | null;
};

// ── ATCF b-deck parsing ──────────────────────────────────────────────

// ATCF fields are comma-separated, fixed positions:
//   0 BASIN 1 CY 2 YYYYMMDDHH 3 TECHNUM 4 TECH 5 TAU 6 LAT 7 LON 8 VMAX
//   9 MSLP 10 TY 11 RAD 12 WINDCODE 13 RAD1 14 RAD2 15 RAD3 16 RAD4
// b-deck (best track) rows carry TECH="BEST"; each wind threshold (34/50/64)
// is its own row at the same timestamp.

/** "275N" → 27.5, "0973W" → -97.3 (tenths of a degree + hemisphere). */
function parseAtcfLatLon(
  latStr: string,
  lonStr: string,
): { lat: number; lon: number } | null {
  const lm = /^(\d+)([NS])$/.exec(latStr);
  const om = /^(\d+)([EW])$/.exec(lonStr);
  if (!lm || !om) return null;
  return {
    lat: (Number(lm[1]) / 10) * (lm[2] === "S" ? -1 : 1),
    lon: (Number(om[1]) / 10) * (om[2] === "W" ? -1 : 1),
  };
}

export function parseAtcfBdeckRadii(text: string): WindRadii | null {
  let latestTime = "";
  const best: string[][] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const f = line.split(",").map((s) => s.trim());
    if (f.length < 17 || f[4] !== "BEST") continue;
    best.push(f);
    if (f[2]! > latestTime) latestTime = f[2]!;
  }
  if (!latestTime) return null;

  const atLatest = best.filter((f) => f[2] === latestTime);
  const first = atLatest[0];
  if (!first) return null;
  const pos = parseAtcfLatLon(first[6]!, first[7]!);

  const result: WindRadii = {
    lat: pos?.lat ?? 0,
    lon: pos?.lon ?? 0,
    vmaxKt: Number.parseInt(first[8]!, 10) || 0,
    validTime: latestTime,
    kt34: null,
    kt50: null,
    kt64: null,
  };

  for (const f of atLatest) {
    const rad = Number.parseInt(f[11]!, 10);
    if (rad !== 34 && rad !== 50 && rad !== 64) continue;
    let q = [
      Number.parseInt(f[13]!, 10) || 0,
      Number.parseInt(f[14]!, 10) || 0,
      Number.parseInt(f[15]!, 10) || 0,
      Number.parseInt(f[16]!, 10) || 0,
    ];
    // "AAA" = full circle (single radius in RAD1); expand to all quadrants.
    if (f[12] === "AAA") q = [q[0]!, q[0]!, q[0]!, q[0]!];
    if (q.some((v) => v > 0)) {
      if (rad === 34) result.kt34 = q;
      else if (rad === 50) result.kt50 = q;
      else result.kt64 = q;
    }
  }

  // No radii at any threshold (e.g. a weak depression) — report nothing
  // rather than invent a circle.
  if (!result.kt34 && !result.kt50 && !result.kt64) return null;
  return result;
}

// ── Single-storm fetch ───────────────────────────────────────────────

async function fetchRadiiForStorm(stormId: string): Promise<WindRadii | null> {
  const url = `${ATCF_BTK_BASE}/b${stormId.toLowerCase()}.dat`;
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!res.ok) return null;
    return parseAtcfBdeckRadii(await res.text());
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────

export type CycloneWindRadiiResult = {
  radii: WindRadii | null;
  fetchedAt: number;
};

/** Current wind radii for a storm. TTL + stale-while-revalidate; a fetch
 *  failure is silent (client just doesn't draw the wind field). */
const radiiCache = createPerKeyCache<WindRadii | null>({
  ttlMs: ATCF_CACHE_TTL_MS,
  purgeIntervalMs: PURGE_INTERVAL_MS,
  emptyValue: null,
  fetch: fetchRadiiForStorm,
});

export async function getCycloneWindRadii(
  stormId: string,
): Promise<CycloneWindRadiiResult> {
  const { value, fetchedAt } = await radiiCache.get(stormId);
  return { radii: value, fetchedAt };
}

export function __resetCycloneAtcfCacheForTests(): void {
  radiiCache.reset();
}
