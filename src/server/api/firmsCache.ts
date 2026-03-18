// ── NASA FIRMS server-side cache ─────────────────────────────────────
// Fetches VIIRS NOAA-20 near-real-time fire hotspot data from NASA FIRMS
// API every 30 minutes. Returns CSV, parsed into structured records.
// Cached in memory. Served via /api/fires/latest with token auth.
//
// Requires env var: FIRMS_MAP_KEY (free from firms.modaps.eosdis.nasa.gov)
// If not set, endpoint returns 503 and fires layer is empty.

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const POLL_INTERVAL_MS = 30 * 60_000; // 30 min
const FETCH_TIMEOUT_MS = 30_000; // FIRMS can be slow for global queries

// ── Types ────────────────────────────────────────────────────────────

type FireRecord = {
  lat: number;
  lon: number;
  brightness: number;
  scan: number;
  track: number;
  acqDate: string;
  acqTime: string;
  satellite: string;
  instrument: string;
  confidence: string;
  version: string;
  brightT31: number;
  frp: number;
  daynight: string;
};

// ── Cache state ──────────────────────────────────────────────────────

type FirmsCache = {
  data: FireRecord[] | null;
  fetchedAt: number;
  fireCount: number;
  error: string | null;
};

let cache: FirmsCache = {
  data: null,
  fetchedAt: 0,
  fireCount: 0,
  error: null,
};

let intervalId: ReturnType<typeof setInterval> | null = null;

// ── CSV parsing ──────────────────────────────────────────────────────

function parseFirmsCsv(csv: string): FireRecord[] {
  const lines = csv.split("\n");
  if (lines.length < 2) return [];

  const header = lines[0]!.toLowerCase();
  if (!header.includes("latitude")) return [];

  const records: FireRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const cols = line.split(",");
    if (cols.length < 14) continue;

    const lat = parseFloat(cols[0] ?? "");
    const lon = parseFloat(cols[1] ?? "");
    if (!isFinite(lat) || !isFinite(lon)) continue;
    if (lat === 0 && lon === 0) continue;

    const brightness = parseFloat(cols[2] ?? "0");
    const scan = parseFloat(cols[3] ?? "0");
    const track = parseFloat(cols[4] ?? "0");
    const acqDate = cols[5]?.trim() ?? "";
    const acqTime = cols[6]?.trim() ?? "";
    const satellite = cols[7]?.trim() ?? "";
    const instrument = cols[8]?.trim() ?? "";
    const confidence = cols[9]?.trim() ?? "";
    const version = cols[10]?.trim() ?? "";
    const brightT31 = parseFloat(cols[11] ?? "0");
    const frp = parseFloat(cols[12] ?? "0");
    const daynight = cols[13]?.trim() ?? "";

    records.push({
      lat,
      lon,
      brightness: isFinite(brightness) ? brightness : 0,
      scan: isFinite(scan) ? scan : 0,
      track: isFinite(track) ? track : 0,
      acqDate,
      acqTime,
      satellite,
      instrument,
      confidence,
      version,
      brightT31: isFinite(brightT31) ? brightT31 : 0,
      frp: isFinite(frp) ? frp : 0,
      daynight,
    });
  }

  return records;
}

// ── Fetch pipeline ───────────────────────────────────────────────────

async function fetchFirms(): Promise<void> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) {
    cache = {
      ...cache,
      error: "FIRMS_MAP_KEY env var not set — fire data unavailable",
    };
    return;
  }

  try {
    const url = `${FIRMS_BASE}/${mapKey}/VIIRS_NOAA20_NRT/world/1`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      cache = { ...cache, error: `FIRMS API returned ${res.status}` };
      return;
    }

    const csv = await res.text();
    const records = parseFirmsCsv(csv);

    // If upstream returned valid response but 0 records (quota exhausted,
    // temporary outage), retain stale cache instead of overwriting with empty
    if (records.length === 0 && cache.data && cache.data.length > 0) {
      console.log(
        "🔥 FIRMS: upstream returned 0 records — retaining stale cache",
      );
      cache = { ...cache, error: "Upstream returned 0 records" };
      return;
    }

    cache = {
      data: records,
      fetchedAt: Date.now(),
      fireCount: records.length,
      error: null,
    };

    if (records.length > 0) {
      console.log(`🔥 FIRMS: ${records.length} fire hotspots loaded`);
    }
  } catch (err) {
    cache = {
      ...cache,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function startFirmsPolling(): void {
  if (intervalId) return;

  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) {
    console.warn("🔥 FIRMS: no API key set, skipping");
    cache.error = "FIRMS_MAP_KEY env var not set — fire data unavailable";
    return;
  }

  console.log("🔥 FIRMS: starting poll...");
  fetchFirms();
  intervalId = setInterval(fetchFirms, POLL_INTERVAL_MS);
}

export function stopFirmsPolling(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function getFirmsCache(): {
  data: FireRecord[] | null;
  fetchedAt: number;
  fireCount: number;
  error: string | null;
} {
  return {
    data: cache.data,
    fetchedAt: cache.fetchedAt,
    fireCount: cache.fireCount,
    error: cache.error,
  };
}
