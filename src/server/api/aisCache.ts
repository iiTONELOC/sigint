// ── AIS server-side cache ────────────────────────────────────────────
// Connects to aisstream.io WebSocket, streams global AIS data.
// Accumulates latest position per MMSI in memory.
// Serves snapshot via /api/ships/latest with token auth.
// Optional env var: AISSTREAM_API_KEY — if absent, ships endpoint returns 503.
//
// Two message types consumed:
//   PositionReport — lat, lon, heading, speed, course, nav status
//   ShipStaticData — name, callsign, IMO, type, destination, draught, dimensions

const AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream";
const RECONNECT_DELAY_MS = 10_000;
const PRUNE_INTERVAL_MS = 5 * 60_000;
const MAX_VESSEL_AGE_MS = 60 * 60_000; // drop vessels not seen for 1 hour

// ── Vessel record ────────────────────────────────────────────────────

type VesselRecord = {
  mmsi: number;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  heading: number;
  navStatus: number;
  lastSeen: number;

  name?: string;
  callSign?: string;
  imo?: number;
  shipType?: number;
  destination?: string;
  draught?: number;
  dimA?: number;
  dimB?: number;
  dimC?: number;
  dimD?: number;
};

// ── Cache state ──────────────────────────────────────────────────────

const vessels = new Map<number, VesselRecord>();
let wsConnection: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let lastError: string | null = null;
let messageCount = 0;

// ── Nav status labels ────────────────────────────────────────────────

const NAV_STATUS_LABELS: Record<number, string> = {
  0: "Under way using engine",
  1: "At anchor",
  2: "Not under command",
  3: "Restricted manoeuvrability",
  4: "Constrained by draught",
  5: "Moored",
  6: "Aground",
  7: "Engaged in fishing",
  8: "Under way sailing",
  9: "Reserved (HSC)",
  10: "Reserved (WIG)",
  11: "Power-driven towing astern",
  12: "Power-driven pushing/towing",
  14: "AIS-SART",
  15: "Not defined",
};

// ── Ship type labels (AIS type codes) ────────────────────────────────

function shipTypeLabel(code?: number): string {
  if (code == null) return "Unknown";
  const labels: Record<number, string> = {
    20: "WIG",
    30: "Fishing",
    31: "Towing",
    32: "Towing (large)",
    33: "Dredging",
    34: "Diving ops",
    35: "Military ops",
    36: "Sailing",
    37: "Pleasure craft",
    40: "HSC",
    50: "Pilot vessel",
    51: "SAR",
    52: "Tug",
    53: "Port tender",
    54: "Anti-pollution",
    55: "Law enforcement",
    58: "Medical",
    59: "Noncombatant",
    60: "Passenger",
    70: "Cargo",
    80: "Tanker",
    90: "Other",
  };
  const tens = Math.floor(code / 10) * 10;
  return labels[code] ?? labels[tens] ?? "Unknown";
}

// ── WebSocket connection ─────────────────────────────────────────────

function connect(): void {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    lastError = "AISSTREAM_API_KEY env var not set — ships data unavailable";
    return;
  }

  try {
    const ws = new WebSocket(AISSTREAM_WS_URL);
    wsConnection = ws;

    ws.addEventListener("open", () => {
      lastError = null;
      const subscription = {
        APIKey: apiKey,
        BoundingBoxes: [[[-90, -180], [90, 180]]],
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      };
      ws.send(JSON.stringify(subscription));
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        messageCount++;
        handleAisMessage(msg);
      } catch {
        // malformed message — skip
      }
    });

    ws.addEventListener("close", () => {
      wsConnection = null;
      scheduleReconnect();
    });

    ws.addEventListener("error", (err) => {
      lastError = `WebSocket error: ${(err as any)?.message ?? "unknown"}`;
    });
  } catch (err) {
    lastError = err instanceof Error ? err.message : "Connection failed";
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

// ── Message handling ─────────────────────────────────────────────────

function handleAisMessage(msg: any): void {
  const msgType = msg.MessageType;
  const meta = msg.MetaData;
  if (!meta?.MMSI) return;

  const mmsi = meta.MMSI as number;
  const now = Date.now();

  if (msgType === "PositionReport") {
    const pos = msg.Message?.PositionReport;
    if (!pos) return;

    const lat = pos.Latitude ?? meta.latitude;
    const lon = pos.Longitude ?? meta.longitude;
    if (lat == null || lon == null) return;
    if (lat === 0 && lon === 0) return;
    if (lat > 90 || lat < -90 || lon > 180 || lon < -180) return;

    const existing = vessels.get(mmsi);
    if (existing) {
      existing.lat = lat;
      existing.lon = lon;
      existing.sog = pos.Sog ?? existing.sog;
      existing.cog = pos.Cog ?? existing.cog;
      existing.heading = pos.TrueHeading ?? existing.heading;
      existing.navStatus = pos.NavigationalStatus ?? existing.navStatus;
      existing.lastSeen = now;
      if (!existing.name && meta.ShipName) {
        existing.name = meta.ShipName.trim();
      }
    } else {
      vessels.set(mmsi, {
        mmsi,
        lat,
        lon,
        sog: pos.Sog ?? 0,
        cog: pos.Cog ?? 0,
        heading: pos.TrueHeading ?? 0,
        navStatus: pos.NavigationalStatus ?? 15,
        lastSeen: now,
        name: meta.ShipName?.trim() || undefined,
      });
    }
  } else if (msgType === "ShipStaticData") {
    const sd = msg.Message?.ShipStaticData;
    if (!sd) return;

    const existing = vessels.get(mmsi);
    if (existing) {
      if (sd.Name) existing.name = sd.Name.trim().replace(/@+$/, "");
      if (sd.CallSign) existing.callSign = sd.CallSign.trim();
      if (sd.ImoNumber && sd.ImoNumber > 0) existing.imo = sd.ImoNumber;
      if (sd.Type != null) existing.shipType = sd.Type;
      if (sd.Destination) existing.destination = sd.Destination.trim().replace(/@+$/, "");
      if (sd.MaximumStaticDraught) existing.draught = sd.MaximumStaticDraught;
      if (sd.Dimension) {
        existing.dimA = sd.Dimension.A;
        existing.dimB = sd.Dimension.B;
        existing.dimC = sd.Dimension.C;
        existing.dimD = sd.Dimension.D;
      }
      existing.lastSeen = now;
    } else {
      const lat = meta.latitude ?? 0;
      const lon = meta.longitude ?? 0;
      if (lat === 0 && lon === 0) return;

      vessels.set(mmsi, {
        mmsi,
        lat,
        lon,
        sog: 0,
        cog: 0,
        heading: 0,
        navStatus: 15,
        lastSeen: now,
        name: sd.Name?.trim().replace(/@+$/, "") || meta.ShipName?.trim(),
        callSign: sd.CallSign?.trim() || undefined,
        imo: sd.ImoNumber > 0 ? sd.ImoNumber : undefined,
        shipType: sd.Type ?? undefined,
        destination: sd.Destination?.trim().replace(/@+$/, "") || undefined,
        draught: sd.MaximumStaticDraught || undefined,
        dimA: sd.Dimension?.A,
        dimB: sd.Dimension?.B,
        dimC: sd.Dimension?.C,
        dimD: sd.Dimension?.D,
      });
    }
  }
}

// ── Pruning ──────────────────────────────────────────────────────────

function pruneStale(): void {
  const cutoff = Date.now() - MAX_VESSEL_AGE_MS;
  for (const [mmsi, v] of vessels) {
    if (v.lastSeen < cutoff) vessels.delete(mmsi);
  }
}

// ── Convert to client payload ────────────────────────────────────────

function toClientPayload(): object[] {
  const result: object[] = [];
  for (const v of vessels.values()) {
    if (v.lat === 0 && v.lon === 0) continue;
    const length = (v.dimA ?? 0) + (v.dimB ?? 0);
    const width = (v.dimC ?? 0) + (v.dimD ?? 0);
    result.push({
      mmsi: v.mmsi,
      lat: v.lat,
      lon: v.lon,
      sog: v.sog,
      cog: v.cog,
      heading: v.heading,
      navStatus: v.navStatus,
      navStatusLabel: NAV_STATUS_LABELS[v.navStatus] ?? "Unknown",
      lastSeen: v.lastSeen,
      name: v.name,
      callSign: v.callSign,
      imo: v.imo,
      shipType: v.shipType,
      shipTypeLabel: shipTypeLabel(v.shipType),
      destination: v.destination,
      draught: v.draught,
      length: length > 0 ? length : undefined,
      width: width > 0 ? width : undefined,
    });
  }
  return result;
}

// ── Public API ───────────────────────────────────────────────────────

export function startAisPolling(): void {
  if (started) return;
  started = true;
  connect();
  pruneTimer = setInterval(pruneStale, PRUNE_INTERVAL_MS);
}

export function stopAisPolling(): void {
  started = false;
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}

export function getAisCache(): {
  data: object[] | null;
  vesselCount: number;
  messageCount: number;
  error: string | null;
  connected: boolean;
} {
  const data = vessels.size > 0 ? toClientPayload() : null;
  return {
    data,
    vesselCount: vessels.size,
    messageCount,
    error: lastError,
    connected: wsConnection?.readyState === WebSocket.OPEN,
  };
}
