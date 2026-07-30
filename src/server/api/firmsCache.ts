// ── NASA FIRMS server-side cache ─────────────────────────────────────
// Pulls the KEYLESS global "last 24h" VIIRS bulk file, polled every 30 min. The
// three birds (NOAA-20, S-NPP, NOAA-21) are tried in priority order as FAILOVER:
// the first feed that returns data wins, so if one platform's feed is down or
// empty the next covers it — without unioning them (which only duplicates the
// same fires). Parsed into structured records, cached in memory, served via
// /api/fires/latest.

import {
  fetchWithTimeout,
  FETCH_TIMEOUT_LARGE_MS,
} from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { createPoller } from "../lib/poller";
import { errorMessage } from "../lib/errorMessage";
import { isFiniteCoordinate, isNullIsland } from "../lib/geoValidation";

const logger = createLogger({ service: "firms" });

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov";
// Failover priority order — first feed that returns data wins.
const FIRMS_BULK_FEEDS = [
  {
    label: "NOAA-20",
    url: `${FIRMS_BASE}/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv`,
  },
  {
    label: "S-NPP",
    url: `${FIRMS_BASE}/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv`,
  },
  {
    label: "NOAA-21",
    url: `${FIRMS_BASE}/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv`,
  },
] as const;
const POLL_INTERVAL_MS = 30 * 60_000; // 30 min

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
  // Fire-complex tagging (filled by clusterFires): how many detections are in
  // this fire's connected cluster, and the cluster's combined FRP.
  complexSize?: number;
  complexFrp?: number;
};

// ~2 km cells, 8-neighbor connectivity — groups adjacent VIIRS pixels into one
// "fire complex" so a smear of dots reads as a countable thing.
const COMPLEX_CELL_DEG = 0.02;

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
  const iBright =
    idx("bright_ti4") >= 0 ? idx("bright_ti4") : idx("brightness");
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
    if (!isFiniteCoordinate(lat, lon) || isNullIsland(lat, lon)) continue;

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

// Fetch + parse one feed. Returns parsed records, or null on any failure so the
// failover can move to the next feed. A non-CSV body (error/maintenance page)
// has no header row — guard on that.
async function fetchOneSource(
  url: string,
  label: string,
): Promise<FireRecord[] | null> {
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_LARGE_MS);
    if (!res.ok) {
      logger.warn(`🔥 FIRMS: ${label} returned ${res.status}`);
      return null;
    }
    const body = await res.text();
    if (!body.toLowerCase().includes("latitude")) {
      logger.warn(
        `🔥 FIRMS: ${label} non-CSV response — ${body.slice(0, 120)}`,
      );
      return null;
    }
    return parseFirmsCsv(body);
  } catch (err) {
    logger.warn(
      `🔥 FIRMS: ${label} fetch failed — ${errorMessage(err, "unknown")}`,
    );
    return null;
  }
}

// Group adjacent detections into connected "complexes" (union-find over a ~2 km
// grid) and tag every record with its complex's pixel count + combined FRP.
function clusterFires(records: FireRecord[]): void {
  const cellOf = (la: number, lo: number) =>
    `${Math.round(la / COMPLEX_CELL_DEG)}:${Math.round(lo / COMPLEX_CELL_DEG)}`;
  const cellFires = new Map<string, number[]>();
  records.forEach((r, i) => {
    const k = cellOf(r.lat, r.lon);
    const arr = cellFires.get(k);
    if (arr) arr.push(i);
    else cellFires.set(k, [i]);
  });

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) ?? root;
    let cur = x;
    while (cur !== root) {
      const nxt = parent.get(cur) ?? cur;
      parent.set(cur, root);
      cur = nxt;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const neighbors: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const k of cellFires.keys()) {
    const [cxs, cys] = k.split(":");
    const cx = Number(cxs);
    const cy = Number(cys);
    for (const [dx, dy] of neighbors) {
      const nk = `${cx + dx}:${cy + dy}`;
      if (cellFires.has(nk)) union(k, nk);
    }
  }

  const stats = new Map<string, { count: number; frp: number }>();
  for (const [k, idxs] of cellFires) {
    const root = find(k);
    const st = stats.get(root) ?? { count: 0, frp: 0 };
    for (const i of idxs) {
      const r = records[i];
      if (!r) continue;
      st.count += 1;
      st.frp += r.frp;
    }
    stats.set(root, st);
  }

  for (const [k, idxs] of cellFires) {
    const st = stats.get(find(k));
    if (!st) continue;
    for (const i of idxs) {
      const r = records[i];
      if (!r) continue;
      r.complexSize = st.count;
      r.complexFrp = Math.round(st.frp);
    }
  }
}

async function fetchFirms(): Promise<void> {
  try {
    // Failover: try feeds in priority order, take the first that returns data.
    for (const feed of FIRMS_BULK_FEEDS) {
      const rows = await fetchOneSource(feed.url, feed.label);
      if (rows && rows.length > 0) {
        clusterFires(rows);
        cache = {
          data: rows,
          fetchedAt: Date.now(),
          fireCount: rows.length,
          error: null,
        };
        logger.info(`🔥 FIRMS: ${rows.length} hotspots loaded (${feed.label})`);
        return;
      }
    }

    // No feed returned data — retain the last good cache rather than blank.
    logger.info("🔥 FIRMS: no feed returned data — retaining stale cache");
    cache = { ...cache, error: "All FIRMS feeds empty/failed" };
  } catch (err) {
    cache = {
      ...cache,
      error: errorMessage(err, "Unknown fetch error"),
    };
  }
}

// ── Public API ───────────────────────────────────────────────────────

const poller = createPoller(fetchFirms, POLL_INTERVAL_MS);

export function startFirmsPolling(_apiKey?: string | undefined): void {
  logger.info(
    `🔥 FIRMS: starting poll (merging ${FIRMS_BULK_FEEDS.length} VIIRS bulk feeds, last 24h)...`,
  );
  poller.start();
}

export function stopFirmsPolling(): void {
  poller.stop();
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
