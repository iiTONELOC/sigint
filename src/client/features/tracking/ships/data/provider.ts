import type { DataPoint } from "@/features/base/dataPoints";
import { BaseProvider } from "@/features/base/BaseProvider";
import { authenticatedFetch } from "@/lib/authService";

const SHIPS_URL = "/api/ships/latest";

// ── Server response shape ────────────────────────────────────────────

type ServerVessel = {
  mmsi: number;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  heading: number;
  navStatus: number;
  navStatusLabel: string;
  lastSeen: number;
  name?: string;
  callSign?: string;
  imo?: number;
  shipType?: number;
  shipTypeLabel?: string;
  destination?: string;
  draught?: number;
  length?: number;
  width?: number;
};

type ServerResponse = {
  data: ServerVessel[];
  vesselCount: number;
  connected: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────

function toDataPoint(v: ServerVessel): DataPoint | null {
  if (v.lat == null || v.lon == null) return null;
  if (v.lat === 0 && v.lon === 0) return null;

  const sogKnots = v.sog ?? 0;
  const speedMps = sogKnots * 0.5144;

  return {
    id: `S${v.mmsi}`,
    type: "ships" as const,
    lat: v.lat,
    lon: v.lon,
    timestamp: new Date(v.lastSeen).toISOString(),
    data: {
      mmsi: v.mmsi,
      imo: v.imo,
      name: v.name,
      callSign: v.callSign,
      vesselType: v.shipTypeLabel ?? "Unknown",
      shipTypeCode: v.shipType,
      speed: Math.round(sogKnots * 10) / 10,
      sog: sogKnots,
      cog: v.cog,
      heading: v.heading,
      navStatus: v.navStatus,
      navStatusLabel: v.navStatusLabel,
      destination: v.destination,
      draught: v.draught,
      length: v.length,
      width: v.width,
      speedMps,
    },
  } as DataPoint;
}

// ── Fetch logic ──────────────────────────────────────────────────────

async function fetchShips(): Promise<DataPoint[]> {
  const response = await authenticatedFetch(SHIPS_URL);

  if (!response.ok) {
    throw new Error(`Ships API error: ${response.status}`);
  }

  const json: ServerResponse = await response.json();

  if (!json.data || !Array.isArray(json.data)) {
    throw new Error("Invalid ships response format");
  }

  const data: DataPoint[] = [];
  for (const v of json.data) {
    const point = toDataPoint(v);
    if (point) data.push(point);
  }
  return data;
}

// ── Provider instance ────────────────────────────────────────────────

export const shipProvider = new BaseProvider({
  id: "ais-ships",
  cacheKey: "sigint.ais.ship-cache.v1",
  maxCacheAgeMs: 30 * 60_000,
  fetchFn: fetchShips,
});
