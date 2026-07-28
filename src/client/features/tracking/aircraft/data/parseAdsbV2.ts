import { firstNumber } from "@shared/types/numbers";
import { Domain } from "@shared/domain/identity";
// ── adsb.fi v3 → AircraftData parser ─────────────────────────────────
// Replaces the inline OpenSky parsing in provider.ts. Pure transform
// from adsb.fi's `{ ac: [...] }` response shape into the existing
// AircraftData / DataPoint contract — no shape changes downstream.
//
// Server proxy: the client never hits opendata.adsb.fi directly. The
// server runs a tile-based polling cache (src/server/api/aircraftCache.
// ts) and serves the merged dedup'd result via /api/aircraft/states
// behind guardAuth — same pattern as ships/events/fires/cyclones.
//
// Field mapping (verified against a live adsb.fi v3 response):
//
//   adsb.fi          → AircraftData
//   ─────────────────────────────────────────────────────────────────
//   hex              → icao24 (lowercase preserved)
//   flight (trimmed) → callsign     (empty/undefined → "Unknown")
//   lat / lon        → DataPoint.lat / DataPoint.lon
//   alt_baro number  → altitude (feet, as-is)
//   alt_baro "ground"→ altitude 0 + onGround true
//   gs               → speed (knots) and speedMps (gs * 0.5144)
//   track | true_heading → heading
//   baro_rate        → verticalRate (m/s, via /196.85)
//   squawk           → squawk
//
// Dropped from the source:
//   - emergency       — squawk codes 7700/7600/7500 carry the signal
//   - dbFlags          — not exposed by adsb.fi v3 (was in paid ADSBex
//                        v2). Military classification is owned by the
//                        existing local NDJSON DB enrichment pipeline.
//
// Server-side enrichment fills these fields before the cache write
// (see src/server/api/aircraftEnrichment.ts):
//   - acType, model, registration, manufacturerName, operator,
//     operatorIcao, categoryDescription, military, originCountry.
// originCountry is derived from the icao24 hex-prefix block per
// ICAO Annex 10 — `country` consumers used to read empty-string and
// fall back to "Unknown"; that fallback still fires for hexes the
// Annex 10 table doesn't yet cover.

import type { DataPoint } from "@/features/base/dataPoints";
import type { ProviderFetchResult } from "@/features/base/types";
import type { AircraftData } from "../types";
import { authenticatedFetch } from "@/lib/net/authService";
import { getSquawkStatus, normalizeIcao24 } from "../lib/utils";
import { ktToMps } from "@/lib/format/units";
import { isRecord } from "@shared/geo";
import { parseSourceState } from "@shared/source";

export const AIRCRAFT_STATES_URL = "/api/aircraft/states";

const FT_PER_MIN_TO_MPS = 196.85;
const MS_PER_SECOND = 1_000;

// ── adsb.fi response shapes ──────────────────────────────────────

type AdsbAircraft = {
  hex?: string;
  flight?: string | null;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number;
  ias?: number;
  tas?: number;
  mach?: number;
  wd?: number;
  ws?: number;
  oat?: number;
  tat?: number;
  track?: number;
  track_rate?: number;
  true_heading?: number;
  mag_heading?: number;
  roll?: number;
  baro_rate?: number;
  geom_rate?: number;
  nav_heading?: number;
  nav_altitude_mcp?: number;
  nav_altitude_fms?: number;
  nav_qnh?: number;
  nav_modes?: readonly string[];
  rssi?: number;
  nac_p?: number;
  type?: string;
  squawk?: string;
  seen?: number;
  seen_pos?: number;
  observedAt?: number;
  // ── Server-attached enrichment (post-aircraftEnrichment.ts) ─────
  // Previously computed in the browser via the local NDJSON DB.
  // The server now does this lookup once per sweep and attaches
  // these fields to each record before the cache write.
  acType?: string;
  registration?: string;
  manufacturerName?: string;
  model?: string;
  operator?: string;
  operatorIcao?: string;
  categoryDescription?: string;
  military?: boolean;
  recon?: boolean;
  originCountry?: string;
};

function isAdsbAircraft(value: unknown): value is AdsbAircraft {
  return isRecord(value);
}

// ── Pure transforms ──────────────────────────────────────────────

export function toAircraftData(a: AdsbAircraft): AircraftData {
  const onGround = a.alt_baro === "ground";
  const altitude = onGround ? 0 : firstNumber(a.alt_baro);

  const speed = typeof a.gs === "number" ? a.gs : 0;
  const speedMps = ktToMps(speed);

  const heading = firstNumber(a.track, a.true_heading);

  const verticalRate =
    typeof a.baro_rate === "number"
      ? a.baro_rate / FT_PER_MIN_TO_MPS
      : undefined;

  const callsignTrimmed = (a.flight ?? "").trim();
  const callsign = callsignTrimmed.length > 0 ? callsignTrimmed : "Unknown";

  // squawkStatus is a UI-only enum and icao24 normalization is cheap — both
  // derived here in the single parse pass so the provider doesn't re-spread
  // every record on the poll tick.
  const icao24 = normalizeIcao24(a.hex) ?? a.hex;

  return {
    icao24,
    callsign,
    squawkStatus: getSquawkStatus(a.squawk),
    originCountry: a.originCountry ?? "",
    acType: a.acType ?? "Unknown",
    altitude,
    speed,
    speedMps,
    heading,
    verticalRate,
    onGround,
    trueHeading: a.true_heading,
    tas: a.tas,
    mach: a.mach,
    ias: a.ias,
    windDir: a.wd,
    windSpd: a.ws,
    oat: a.oat,
    tat: a.tat,
    roll: a.roll,
    trackRate: a.track_rate,
    magHeading: a.mag_heading,
    geomRate: a.geom_rate,
    navHeading: a.nav_heading,
    navAltitudeMcp: a.nav_altitude_mcp,
    navAltitudeFms: a.nav_altitude_fms,
    navQnh: a.nav_qnh,
    navModes: a.nav_modes,
    rssi: a.rssi,
    nacP: a.nac_p,
    adsbType: a.type,
    squawk: a.squawk,
    registration: a.registration,
    manufacturerName: a.manufacturerName,
    model: a.model,
    operator: a.operator,
    operatorIcao: a.operatorIcao,
    categoryDescription: a.categoryDescription,
    military: a.military,
    recon: a.recon,
  };
}

function observationTime(
  aircraft: AdsbAircraft,
  receivedAt: number,
): number {
  if (
    typeof aircraft.observedAt === "number" &&
    Number.isFinite(aircraft.observedAt)
  ) {
    return Math.min(aircraft.observedAt, receivedAt);
  }
  const positionAge = firstNumber(aircraft.seen_pos, aircraft.seen);
  return receivedAt - Math.max(0, positionAge) * MS_PER_SECOND;
}

function toDataPoint(
  aircraft: AdsbAircraft,
  receivedAt: number,
): DataPoint | null {
  if (!aircraft.hex) return null;
  if (
    typeof aircraft.lat !== "number" ||
    typeof aircraft.lon !== "number"
  ) {
    return null;
  }
  return {
    id: `A${aircraft.hex}`,
    type: Domain.Aircraft,
    lat: aircraft.lat,
    lon: aircraft.lon,
    timestamp: new Date(
      observationTime(aircraft, receivedAt),
    ).toISOString(),
    data: toAircraftData(aircraft),
  };
}

export function parseAdsbResponse(
  json: unknown,
  receivedAt = Date.now(),
): DataPoint[] {
  if (!isRecord(json) || !Array.isArray(json.ac)) return [];
  const out: DataPoint[] = [];
  for (const value of json.ac) {
    if (!isAdsbAircraft(value)) continue;
    const point = toDataPoint(value, receivedAt);
    if (point) out.push(point);
  }
  return out;
}

// ── Fetch path ──────────────────────────────────────────────────

export function parseAircraftFetchResult(
  value: unknown,
  receivedAt = Date.now(),
): ProviderFetchResult<DataPoint> | null {
  if (!isRecord(value) || !Array.isArray(value.ac)) return null;
  const source = parseSourceState(value.source);
  if (source?.source !== Domain.Aircraft) return null;
  return {
    data: parseAdsbResponse(value, receivedAt),
    source,
  };
}

export async function fetchAircraftSnapshot(): Promise<
  ProviderFetchResult<DataPoint>
> {
  const response = await authenticatedFetch(AIRCRAFT_STATES_URL);
  if (!response.ok) {
    throw new Error(`${AIRCRAFT_STATES_URL}: ${response.status}`);
  }
  const result = parseAircraftFetchResult(await response.json());
  if (!result) {
    throw new Error(`${AIRCRAFT_STATES_URL}: invalid source envelope`);
  }
  return result;
}

export async function fetchAircraftStates(): Promise<DataPoint[]> {
  return (await fetchAircraftSnapshot()).data;
}
