// Airport coordinate lookup (ICAO/IATA → [lat, lon]). Source data is built from
// the public-domain OurAirports dataset by scripts/build-airports.ts into
// public/data/airports.json.gz, fetched once and decoded with
// DecompressionStream("gzip") — the same gzip transport storageService uses.
// Mirrors landService's cache + in-flight-waiter pattern.

import { cacheGet, cacheSet } from "@/lib/cache/storageService";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";

type AirportMap = Record<string, [number, number]>;

const CACHE_KEY = CACHE_KEYS.airports;
const URL = "/data/airports.json.gz";

let airports: AirportMap | null = null;
let fetchInFlight = false;
let waiters: Array<(a: AirportMap) => void> = [];

async function readCache(): Promise<AirportMap | null> {
  const cached = await cacheGet<AirportMap>(CACHE_KEY);
  if (cached && typeof cached === "object" && Object.keys(cached).length > 0) {
    return cached;
  }
  return null;
}

/** Call once at boot to load airports from IndexedDB. */
export async function initAirports(): Promise<void> {
  if (airports) return;
  const cached = await readCache();
  if (cached) airports = cached;
}

/** ICAO or IATA code → [lat, lon], or null if unknown / not yet loaded. */
export function getAirport(code?: string): [number, number] | null {
  if (!code || !airports) return null;
  return airports[code.toUpperCase()] ?? null;
}

/** Fetch the table if not already available; calls back when ready. */
export function enrichAirports(onReady: (a: AirportMap) => void): void {
  if (airports) {
    onReady(airports);
    return;
  }
  waiters.push(onReady);
  if (fetchInFlight) return;
  fetchInFlight = true;

  fetch(URL)
    .then((res) => {
      if (!res.ok || !res.body) throw new Error(`${res.status}`);
      const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
      return new Response(stream).json();
    })
    .then((data: AirportMap) => {
      airports = data;
      cacheSet(CACHE_KEY, data);
      const cbs = waiters;
      waiters = [];
      for (const cb of cbs) cb(data);
    })
    .catch((err) => {
      // No airports.json.gz yet (run `bun run build:airports`) — notify waiters
      // so they stop showing "loading" and fall back to the iso flight path.
      console.warn("Airport data unavailable:", err?.message ?? err);
      const cbs = waiters;
      waiters = [];
      for (const cb of cbs) cb({});
    })
    .finally(() => {
      fetchInFlight = false;
    });
}
