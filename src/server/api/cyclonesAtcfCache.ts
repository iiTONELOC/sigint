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

import { fetchWithTimeout, FETCH_TIMEOUT_STANDARD_MS } from "../lib/fetchWithTimeout";
import { createPerKeyCache, PURGE_INTERVAL_MS } from "../lib/perKeyCache";
import { getStormProducts } from "./cyclonesCache";

const ATCF_BTK_BASE = "https://ftp.nhc.noaa.gov/atcf/btk";
// Revalidate on the advisory rhythm (full advisories every 6h, intermediate
// every 3h during watches/warnings). Each revalidation is a conditional GET, so
// an unchanged b-deck costs only a 304. Keep an active storm's entry for 12h of
// no access so its accumulated past track survives between polls and isn't
// re-downloaded; a dissipated storm (no longer polled) is purged after that.
const ATCF_CACHE_TTL_MS = 3 * 60 * 60_000;
const ATCF_RETENTION_MS = 12 * 60 * 60_000;

// Last-Modified per storm for conditional revalidation (If-Modified-Since).
const lastModified = new Map<string, string>();

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

function parseAtcfPressure(value: string | undefined): number | null {
  if (!value) return null;
  const pressure = Number.parseInt(value, 10);
  return Number.isFinite(pressure) && pressure > 0 ? pressure : null;
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

/** One analyzed past position from the best track. */
export type TrackPoint = {
  lat: number;
  lon: number;
  validTime: string; // ATCF YYYYMMDDHH
  vmaxKt: number;
  minPressureMb: number | null;
};

/** Full observed (best-track) history, genesis → latest, one point per analysis
 *  time. Same b-deck file as the radii — the storm's actual path so far. */
export function parseAtcfTrack(text: string): TrackPoint[] {
  const byTime = new Map<string, TrackPoint>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const f = line.split(",").map((s) => s.trim());
    if (f.length < 9 || f[4] !== "BEST") continue;
    const time = f[2]!;
    if (byTime.has(time)) continue; // first row per timestamp carries position
    const pos = parseAtcfLatLon(f[6]!, f[7]!);
    if (!pos) continue;
    byTime.set(time, {
      lat: pos.lat,
      lon: pos.lon,
      validTime: time,
      vmaxKt: Number.parseInt(f[8]!, 10) || 0,
      minPressureMb: parseAtcfPressure(f[9]),
    });
  }
  return [...byTime.values()].sort((a, b) =>
    a.validTime < b.validTime ? -1 : 1,
  );
}

// ── Single-storm fetch ───────────────────────────────────────────────

export type AtcfData = { radii: WindRadii | null; track: TrackPoint[] };

const EMPTY_ATCF: AtcfData = { radii: null, track: [] };

// One b-deck fetch yields both the current radii and the full past track. When
// the storm is already cached we send If-Modified-Since: an unchanged file 304s
// and we reuse the previously-parsed data instead of re-downloading + re-parsing.
async function fetchAtcfForStorm(
  stormId: string,
  prev: AtcfData | undefined,
): Promise<AtcfData> {
  const url = `${ATCF_BTK_BASE}/b${stormId.toLowerCase()}.dat`;
  const since = lastModified.get(stormId);
  try {
    const res = await fetchWithTimeout(
      url,
      FETCH_TIMEOUT_STANDARD_MS,
      since ? { headers: { "If-Modified-Since": since } } : undefined,
    );
    if (res.status === 304 && prev) return prev; // unchanged — reuse parsed data
    if (!res.ok) return prev ?? EMPTY_ATCF;
    const mod = res.headers.get("last-modified");
    if (mod) lastModified.set(stormId, mod);
    const text = await res.text();
    return { radii: parseAtcfBdeckRadii(text), track: parseAtcfTrack(text) };
  } catch {
    return prev ?? EMPTY_ATCF;
  }
}

// ── Public API ───────────────────────────────────────────────────────

export type CycloneAtcfResult = AtcfData & { fetchedAt: number };

/** Current wind radii + observed past track for a storm. TTL + stale-while-
 *  revalidate; a fetch failure is silent (client just omits the overlays). */
const atcfCache = createPerKeyCache<AtcfData>({
  ttlMs: ATCF_CACHE_TTL_MS,
  retentionMs: ATCF_RETENTION_MS,
  purgeIntervalMs: PURGE_INTERVAL_MS,
  emptyValue: EMPTY_ATCF,
  fetch: fetchAtcfForStorm,
});

export async function getCycloneAtcf(
  stormId: string,
): Promise<CycloneAtcfResult> {
  const { value, fetchedAt } = await atcfCache.get(stormId);
  return { radii: value.radii, track: value.track, fetchedAt };
}

// ── Model guidance (a-deck "spaghetti") ──────────────────────────────
// Lazy, on-demand only (the MODELS toggle) — never embedded in the storm feed,
// since the a-deck is large. Curated to the major track-guidance models so the
// plot reads as spaghetti, not noise. Same conditional-GET + retention pattern.

const ATCF_ADECK_BASE = "https://ftp.nhc.noaa.gov/atcf/aid_public";
const SPAGHETTI_MODELS = new Set([
  "OFCL", "AVNO", "GFSO", "EMXI", "EMX", "CMC", "CMCI",
  "HWRF", "HWFI", "HMON", "HMNI", "UKM", "UKMI", "NVGM", "AEMN", "TVCN",
]);

export type ModelTrackPoint = { tau: number; lat: number; lon: number };
export type ModelTrack = { model: string; points: ModelTrackPoint[] };

// A meaningful spaghetti plot needs several models agreeing/diverging, not a
// lone straggler. The chosen init must carry at least this many distinct models.
const MIN_SPAGHETTI_MODELS = 3;

/** Get-or-create the value for `key` in a Map — flattens the build loops below. */
function mapEntry<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const created = make();
  map.set(key, created);
  return created;
}

/** Parse the lines of an a-deck into the spaghetti-model rows we care about,
 *  paired with their init time and curated model code. */
function spaghettiRows(text: string): Array<{ init: string; model: string; fields: string[] }> {
  const out: Array<{ init: string; model: string; fields: string[] }> = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const f = line.split(",").map((s) => s.trim());
    if (f.length >= 8 && SPAGHETTI_MODELS.has(f[4]!)) {
      out.push({ init: f[2]!, model: f[4]!, fields: f });
    }
  }
  return out;
}

/** YYYYMMDDHH → epoch ms (UTC). Returns NaN if not a 10-digit init string. */
function initToMs(init: string): number {
  if (!/^\d{10}$/.test(init)) return Number.NaN;
  const y = +init.slice(0, 4), mo = +init.slice(4, 6), d = +init.slice(6, 8), h = +init.slice(8, 10);
  return Date.UTC(y, mo - 1, d, h);
}

/** Init carrying at least MIN_SPAGHETTI_MODELS distinct models that best matches
 *  the storm. When `analysisInit` is given, choose the guidance init CLOSEST to
 *  the storm's analysis time so the spaghetti aligns with the storm's actual
 *  position/forecast (a fixture at peak shouldn't borrow the weakening-tail
 *  cycle's tracks). Without it, fall back to the newest guidance-bearing init —
 *  NOT the newest init overall, since a storm's final a-deck cycles are often a
 *  sparse tail (only CARQ / a lone late model). */
function pickGuidanceInit(
  rows: ReadonlyArray<{ init: string; model: string }>,
  analysisInit?: string,
): string | null {
  const modelsByInit = new Map<string, Set<string>>();
  for (const r of rows) {
    mapEntry(modelsByInit, r.init, () => new Set<string>()).add(r.model);
  }
  const candidates = [...modelsByInit.entries()]
    .filter(([, models]) => models.size >= MIN_SPAGHETTI_MODELS)
    .map(([init]) => init);
  if (candidates.length === 0) return null;

  const seed = candidates[0]!;
  const targetMs = analysisInit ? initToMs(analysisInit) : Number.NaN;
  if (Number.isFinite(targetMs)) {
    return candidates.reduce(
      (best, init) =>
        Math.abs(initToMs(init) - targetMs) < Math.abs(initToMs(best) - targetMs) ? init : best,
      seed,
    );
  }
  return candidates.reduce((best, init) => (init.localeCompare(best) > 0 ? init : best), seed);
}

/** Per-model forecast tracks from the a-deck. Picks the guidance init nearest
 *  `analysisInit` (the storm's YYYYMMDDHH analysis time) so the spaghetti aligns
 *  with the storm's position/forecast; without it, the newest guidance-bearing
 *  init. One point per (model, TAU); models with fewer than 2 points dropped. */
export function parseAtcfAdeck(text: string, analysisInit?: string): ModelTrack[] {
  const rows = spaghettiRows(text);
  const chosen = pickGuidanceInit(rows, analysisInit);
  if (!chosen) return [];

  const byModel = new Map<string, Map<number, ModelTrackPoint>>();
  for (const { init, model, fields } of rows) {
    if (init !== chosen) continue;
    const tau = Number.parseInt(fields[5]!, 10);
    const pos = parseAtcfLatLon(fields[6]!, fields[7]!);
    if (!Number.isFinite(tau) || !pos) continue;
    const tauMap = mapEntry(byModel, model, () => new Map<number, ModelTrackPoint>());
    if (!tauMap.has(tau)) tauMap.set(tau, { tau, lat: pos.lat, lon: pos.lon });
  }

  const tracks: ModelTrack[] = [];
  for (const [model, m] of byModel) {
    const points = [...m.values()].sort((a, b) => a.tau - b.tau);
    if (points.length >= 2) tracks.push({ model, points });
  }
  return tracks;
}

const adeckLastModified = new Map<string, string>();

async function fetchModelsForStorm(
  stormId: string,
  prev: ModelTrack[] | undefined,
): Promise<ModelTrack[]> {
  // aid_public a-decks are gzipped on the NHC server, unlike the plain b-deck.
  // A dev fixture may override the URL (e.g. point at a real archived a-deck).
  const products = getStormProducts(stormId);
  const url =
    products?.modelsUrl ??
    `${ATCF_ADECK_BASE}/a${stormId.toLowerCase()}.dat.gz`;
  const since = adeckLastModified.get(stormId);
  try {
    const res = await fetchWithTimeout(
      url,
      FETCH_TIMEOUT_STANDARD_MS,
      since ? { headers: { "If-Modified-Since": since } } : undefined,
    );
    if (res.status === 304 && prev) return prev;
    if (!res.ok || !res.body) return prev ?? [];
    const mod = res.headers.get("last-modified");
    if (mod) adeckLastModified.set(stormId, mod);
    const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    return parseAtcfAdeck(text, products?.analysisInit);
  } catch {
    return prev ?? [];
  }
}

const modelsCache = createPerKeyCache<ModelTrack[]>({
  ttlMs: ATCF_CACHE_TTL_MS,
  retentionMs: ATCF_RETENTION_MS,
  purgeIntervalMs: PURGE_INTERVAL_MS,
  emptyValue: [],
  fetch: fetchModelsForStorm,
});

export type CycloneModelsResult = { models: ModelTrack[]; fetchedAt: number };

/** Spaghetti model tracks for a storm (lazy — only fetched when requested). */
export async function getCycloneModels(
  stormId: string,
): Promise<CycloneModelsResult> {
  const { value, fetchedAt } = await modelsCache.get(stormId);
  return { models: value, fetchedAt };
}

export function __resetCycloneAtcfCacheForTests(): void {
  atcfCache.reset();
  modelsCache.reset();
  lastModified.clear();
  adeckLastModified.clear();
}
