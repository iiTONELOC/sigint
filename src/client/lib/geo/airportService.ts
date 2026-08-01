import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";

type AirportMap = Record<string, [number, number]>;

enum AirportAssetPath {
  Data = "/data/airports.json.gz",
}

enum AirportCompressionFormat {
  Gzip = "gzip",
}

enum AirportDataErrorKind {
  RequestRejected = "The airport data request failed",
}

enum AirportDataLogMessage {
  Unavailable = "Airport data unavailable:",
}

class AirportDataError extends Error {
  constructor(
    readonly kind: AirportDataErrorKind,
    readonly httpStatus: number,
  ) {
    super(kind);
    this.name = AirportDataError.name;
  }
}

let airports: AirportMap | null = null;
let fetchInFlight = false;
let waiters: Array<(a: AirportMap) => void> = [];

async function readCache(): Promise<AirportMap | null> {
  const cached = await cacheGet<AirportMap>(CacheKey.Airports);
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

  fetch(AirportAssetPath.Data)
    .then((res) => {
      if (!res.ok || !res.body) {
        throw new AirportDataError(
          AirportDataErrorKind.RequestRejected,
          res.status,
        );
      }
      const stream = res.body.pipeThrough(
        new DecompressionStream(AirportCompressionFormat.Gzip),
      );
      return new Response(stream).json();
    })
    .then((data: AirportMap) => {
      airports = data;
      cacheSet(CacheKey.Airports, data);
      const cbs = waiters;
      waiters = [];
      for (const cb of cbs) cb(data);
    })
    .catch((err) => {
      // Notify every caller so each route can use its fallback path.
      console.warn(AirportDataLogMessage.Unavailable, err?.message ?? err);
      const cbs = waiters;
      waiters = [];
      for (const cb of cbs) cb({});
    })
    .finally(() => {
      fetchInFlight = false;
    });
}
