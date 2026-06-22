// ── Regional baseline accumulation + persistence ───────────────────
// Module-level rolling window of per-country event counts, persisted
// to IndexedDB so it survives reloads and grows smarter with use.

import type { DataPoint } from "@/features/base/dataPoints";
import { cacheGet, cacheSet } from "@/lib/cache/storageService";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import type { CountryWindow, RegionBaseline } from "./types";
import { BASELINE_BUCKETS, HOUR, getCountry, getTs } from "./shared";

const BASELINE_KEY = CACHE_KEYS.intelBaseline;

let _baselineCache: RegionBaseline | null = null;

/** Call once at boot to load baseline from IndexedDB. */
export async function initBaseline(): Promise<void> {
  const cached = await cacheGet<RegionBaseline>(BASELINE_KEY);
  if (cached && cached.countries && typeof cached.lastUpdated === "number") {
    _baselineCache = cached;
  }
}

export function loadBaseline(): RegionBaseline {
  if (
    _baselineCache &&
    _baselineCache.countries &&
    typeof _baselineCache.lastUpdated === "number"
  ) {
    return _baselineCache;
  }
  return { countries: {}, lastUpdated: 0 };
}

export function persistBaseline(baseline: RegionBaseline): void {
  cacheSet(BASELINE_KEY, baseline);
}

function getBucketIndex(ts: number, bucketStart: number): number {
  return Math.floor((ts - bucketStart) / HOUR);
}

export function ensureCountryWindow(
  baseline: RegionBaseline,
  country: string,
  now: number,
): CountryWindow {
  let win = baseline.countries[country];
  if (!win) {
    win = {
      buckets: new Array(BASELINE_BUCKETS).fill(0),
      bucketStart: now - BASELINE_BUCKETS * HOUR,
      total: 0,
    };
    baseline.countries[country] = win;
  }

  const age = now - win.bucketStart;
  const shift = Math.floor(age / HOUR) - BASELINE_BUCKETS;
  if (shift > 0) {
    if (shift >= BASELINE_BUCKETS) {
      win.buckets = new Array(BASELINE_BUCKETS).fill(0);
      win.bucketStart = now - BASELINE_BUCKETS * HOUR;
      win.total = 0;
    } else {
      const removed = win.buckets.splice(0, shift);
      const removedSum = removed.reduce((a, b) => a + b, 0);
      win.total -= removedSum;
      for (let i = 0; i < shift; i++) win.buckets.push(0);
      win.bucketStart += shift * HOUR;
    }
  }

  return win;
}

export function recordEvent(
  baseline: RegionBaseline,
  country: string,
  ts: number,
  now: number,
): void {
  if (country === "Unknown" || country === "Global") return;
  const win = ensureCountryWindow(baseline, country, now);
  const idx = getBucketIndex(ts, win.bucketStart);
  if (idx >= 0 && idx < BASELINE_BUCKETS) {
    win.buckets[idx]!++;
    win.total++;
  }
}

/** Average events per hour over the stable window (excludes last 24h). */
export function avgRate(win: CountryWindow): number {
  const stableBuckets = win.buckets.slice(0, BASELINE_BUCKETS - 24);
  if (stableBuckets.length === 0) return 0;
  const sum = stableBuckets.reduce((a, b) => a + b, 0);
  return sum / stableBuckets.length;
}

/** Events in last N hours. */
export function recentCount(win: CountryWindow, hours: number): number {
  const start = Math.max(0, BASELINE_BUCKETS - hours);
  let sum = 0;
  for (let i = start; i < BASELINE_BUCKETS; i++) sum += win.buckets[i]!;
  return sum;
}

const intelTypes = new Set(["events", "quakes", "fires", "weather"]);

export function emptyBaseline(): RegionBaseline {
  return { countries: {}, lastUpdated: 0 };
}

/** Update an in-memory baseline with new data points. Pure: caller owns
 *  the baseline value and is responsible for persistence. */
export function accumulate(
  allData: DataPoint[],
  baselineIn?: RegionBaseline,
): RegionBaseline {
  const now = Date.now();
  const baseline = baselineIn ?? loadBaseline();
  for (const item of allData) {
    if (!intelTypes.has(item.type)) continue;
    const country = getCountry(item);
    const ts = getTs(item);
    recordEvent(baseline, country, ts, now);
  }
  baseline.lastUpdated = now;
  return baseline;
}
