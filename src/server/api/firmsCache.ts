// ── NASA FIRMS server-side cache ─────────────────────────────────────
// Fetches the KEYLESS global VIIRS NOAA-20 "last 24h" bulk CSV from NASA
// FIRMS every 30 min — no API key, ~75k rows, full day + night coverage.
// The keyed api/area NRT query thinned out and dropped points at night;
// the bulk file is a static no-quota file. Parsed into structured records,
// cached in memory, served via /api/fires/latest with token auth.

import { createLogger } from "../lib/logger";

const logger = createLogger({ service: "firms" });

// Keyless global bulk file. One column shorter than the keyed api/area CSV
// (it omits `instrument`), so parseFirmsCsv maps fields by header name.
const FIRMS_URL =
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv";
const POLL_INTERVAL_MS = 30 * 60_000; // 30 min
const FETCH_TIMEOUT_MS = 30_000; // global file is large

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

export function parseFirmsCsv(csv: string): FireRecord[] {
  const lines = csv.split("\n");
  if (lines.length < 2) return [];

  // Map columns by header name — the keyless bulk file omits `instrument`
  // (13 cols) while the keyed api/area CSV includes it (14 cols).
  const header = lines[0]!.trim().toLowerCase().split(",");
  const idx = (name: string) => header.indexOf(name);
  const iLat = idx("latitude");
  const iLon = idx("longitude");
  if (iLat < 0 || iLon < 0) return [];

  // VIIRS uses bright_ti4/bright_ti5; MODIS (and the old CSV) brightness/bright_t31.
  const iBright = idx("bright_ti4") >= 0 ? idx("bright_ti4") : idx("brightness");
  const iScan = idx("scan");
  const iTrack = idx("track");
  const iAcqDate = idx("acq_date");
  const iAcqTime = idx("acq_time");
  const iSat = idx("satellite");
  const iInstr = idx("instrument");
  const iConf = idx("confidence");
  const iVer = idx("version");
  const iBT31 = idx("bright_ti5") >= 0 ? idx("bright_ti5") : idx("bright_t31");
  const iFrp = idx("frp");
  const iDay = idx("daynight");

  const num = (cols: string[], i: number): number => {
    if (i < 0) return 0;
    const v = Number.parseFloat(cols[i] ?? "0");
    return Number.isFinite(v) ? v : 0;
  };
  const str = (cols: string[], i: number): string =>
    i >= 0 ? (cols[i]?.trim() ?? "") : "";

  const records: FireRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const cols = line.split(",");
    if (cols.length < header.length) continue; // malformed / truncated row

    const lat = Number.parseFloat(cols[iLat] ?? "");
    const lon = Number.parseFloat(cols[iLon] ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat === 0 && lon === 0) continue;

    records.push({
      lat,
      lon,
      brightness: num(cols, iBright),
      scan: num(cols, iScan),
      track: num(cols, iTrack),
      acqDate: str(cols, iAcqDate),
      acqTime: str(cols, iAcqTime),
      satellite: str(cols, iSat),
      instrument: iInstr >= 0 ? str(cols, iInstr) : "VIIRS",
      confidence: str(cols, iConf),
      version: str(cols, iVer),
      brightT31: num(cols, iBT31),
      frp: num(cols, iFrp),
      daynight: str(cols, iDay),
    });
  }

  return records;
}

// ── Fetch pipeline ───────────────────────────────────────────────────

async function fetchFirms(): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(FIRMS_URL, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      cache = { ...cache, error: `FIRMS returned ${res.status}` };
      return;
    }

    const csv = await res.text();
    const records = parseFirmsCsv(csv);

    // If upstream returned valid response but 0 records (quota exhausted,
    // temporary outage), retain stale cache instead of overwriting with empty
    if (records.length === 0 && cache.data && cache.data.length > 0) {
      logger.info(
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
      logger.info(`🔥 FIRMS: ${records.length} fire hotspots loaded`);
    }
  } catch (err) {
    cache = {
      ...cache,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
}

// ── Public API ───────────────────────────────────────────────────────

// apiKey kept for call-site compatibility; the keyless bulk feed ignores it.
export function startFirmsPolling(_apiKey?: string | undefined): void {
  if (intervalId) return;
  logger.info("🔥 FIRMS: starting poll (keyless global 24h feed)...");
  void fetchFirms();
  intervalId = setInterval(() => void fetchFirms(), POLL_INTERVAL_MS);
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

/** TEST-ONLY: reset module state to the initial empty shape. */
export function __resetFirmsCacheForTests(): void {
  cache = { data: null, fetchedAt: 0, fireCount: 0, error: null };
}
