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
// Left for the local DB enrichment to fill (existing behavior):
//   - acType, model, registration, manufacturerName, operator,
//     operatorIcao, categoryDescription, military.
//
// Future ticket: derive originCountry from icao24 hex prefix range.

import type { DataPoint } from "@/features/base/dataPoints";
import type { AircraftData } from "../types";
import { authenticatedFetch } from "@/lib/authService";

export const AIRCRAFT_STATES_URL = "/api/aircraft/states";

const KNOTS_TO_MPS = 0.5144;
const FT_PER_MIN_TO_MPS = 196.85;

// ── adsb.fi response shapes ──────────────────────────────────────

type AdsbAircraft = {
  hex?: string;
  flight?: string | null;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number;
  track?: number;
  true_heading?: number;
  baro_rate?: number;
  squawk?: string;
};

type AdsbResponse = { ac?: AdsbAircraft[] };

// ── Pure transforms ──────────────────────────────────────────────

export function toAircraftData(a: AdsbAircraft): AircraftData {
  const onGround = a.alt_baro === "ground";
  const altitude = onGround
    ? 0
    : typeof a.alt_baro === "number"
      ? a.alt_baro
      : 0;

  const speed = typeof a.gs === "number" ? a.gs : 0;
  const speedMps = speed * KNOTS_TO_MPS;

  const heading =
    typeof a.track === "number"
      ? a.track
      : typeof a.true_heading === "number"
        ? a.true_heading
        : 0;

  const verticalRate =
    typeof a.baro_rate === "number"
      ? a.baro_rate / FT_PER_MIN_TO_MPS
      : undefined;

  const callsignTrimmed = (a.flight ?? "").trim();
  const callsign = callsignTrimmed.length > 0 ? callsignTrimmed : "Unknown";

  return {
    icao24: a.hex,
    callsign,
    originCountry: "",
    acType: "Unknown",
    altitude,
    speed,
    speedMps,
    heading,
    verticalRate,
    onGround,
    squawk: a.squawk,
  };
}

function toDataPoint(a: AdsbAircraft): DataPoint | null {
  if (!a.hex) return null;
  if (typeof a.lat !== "number" || typeof a.lon !== "number") return null;
  return {
    id: `A${a.hex}`,
    type: "aircraft" as const,
    lat: a.lat,
    lon: a.lon,
    timestamp: new Date().toISOString(),
    data: toAircraftData(a),
  } as DataPoint;
}

export function parseAdsbResponse(json: unknown): DataPoint[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  const ac = (json as AdsbResponse).ac;
  if (!Array.isArray(ac)) return [];
  const out: DataPoint[] = [];
  for (const a of ac) {
    const pt = toDataPoint(a);
    if (pt) out.push(pt);
  }
  return out;
}

// ── Fetch path ──────────────────────────────────────────────────

export async function fetchAircraftStates(): Promise<DataPoint[]> {
  const res = await authenticatedFetch(AIRCRAFT_STATES_URL);
  if (!res.ok) throw new Error(`${AIRCRAFT_STATES_URL}: ${res.status}`);
  const json = (await res.json()) as unknown;
  return parseAdsbResponse(json);
}
