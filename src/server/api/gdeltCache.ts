// ── GDELT server-side cache ──────────────────────────────────────────
// Fetches GDELT 2.0 raw export files every 15 minutes.
// Parses tab-delimited CSV for geocoded events with lat/lon.
// Single consumer of GDELT data regardless of client count.
// Zero external dependencies — zip extraction uses Node zlib inflateRaw.

import { inflateRaw } from "zlib";
import { promisify } from "util";

const inflateRawAsync = promisify(inflateRaw);

// ── GDELT raw data URLs ──────────────────────────────────────────────

const LASTUPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";
const POLL_INTERVAL_MS = 15 * 60_000;

// ── ZIP extraction (zero deps) ───────────────────────────────────────
// ZIP local file header: PK\x03\x04, then fixed fields, then filename,
// then extra, then compressed data. We use Node zlib inflateRaw on the
// DEFLATE payload. Works in Bun, Node, anywhere — no shell, no deps.

async function extractZipFirstFile(zipBuffer: ArrayBuffer): Promise<string> {
  const buf = Buffer.from(zipBuffer);

  // Verify ZIP signature
  if (
    buf[0] !== 0x50 ||
    buf[1] !== 0x4b ||
    buf[2] !== 0x03 ||
    buf[3] !== 0x04
  ) {
    throw new Error("Not a valid ZIP file");
  }

  const compressionMethod = buf.readUInt16LE(8);
  const compressedSize = buf.readUInt32LE(18);
  const filenameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const dataOffset = 30 + filenameLen + extraLen;

  const compressedData = buf.subarray(dataOffset, dataOffset + compressedSize);

  if (compressionMethod === 0) {
    // Stored (no compression)
    return compressedData.toString("utf-8");
  }

  if (compressionMethod === 8) {
    // DEFLATE
    const decompressed = await inflateRawAsync(compressedData);
    return decompressed.toString("utf-8");
  }

  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
}

// ── GDELT export CSV parsing ─────────────────────────────────────────
// Tab-delimited, 61 columns per GDELT 2.0 Event Codebook.

const COL = {
  GlobalEventID: 0,
  Actor1Name: 6,
  Actor2Name: 16,
  EventCode: 26,
  EventBaseCode: 27,
  EventRootCode: 28,
  GoldsteinScale: 30,
  NumMentions: 31,
  AvgTone: 34,
  ActionGeo_Type: 43,
  ActionGeo_Fullname: 44,
  ActionGeo_CountryCode: 45,
  ActionGeo_Lat: 48,
  ActionGeo_Long: 49,
  SOURCEURL: 60,
  DATEADDED: 59,
} as const;

// CAMEO root codes we care about (conflict, protest, military, etc.)
// 14 = Protest, 17 = Coerce, 18 = Assault, 19 = Fight, 20 = Unconventional mass violence
// Also include 10 = Demand, 13 = Threaten, 15 = Exhibit military posture
const RELEVANT_ROOT_CODES = new Set([
  "10",
  "13",
  "14",
  "15",
  "17",
  "18",
  "19",
  "20",
]);

type GdeltEvent = {
  id: string;
  lat: number;
  lon: number;
  timestamp: string;
  headline: string;
  actor1: string;
  actor2: string;
  eventCode: string;
  goldstein: number;
  tone: number;
  mentions: number;
  locationName: string;
  countryCode: string;
  sourceUrl: string;
  severity: number;
  category: string;
};

function parseDateAdded(dateStr: string): string {
  // Format: YYYYMMDDHHMMSS
  if (dateStr.length < 14) return new Date().toISOString();
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  const h = dateStr.slice(8, 10);
  const mn = dateStr.slice(10, 12);
  const s = dateStr.slice(12, 14);
  return new Date(`${y}-${m}-${d}T${h}:${mn}:${s}Z`).toISOString();
}

function goldsteinToSeverity(gs: number): {
  severity: number;
  category: string;
} {
  // Goldstein scale: -10 (most conflictual) to +10 (most cooperative)
  if (gs <= -7) return { severity: 5, category: "Crisis" };
  if (gs <= -4) return { severity: 4, category: "Conflict" };
  if (gs <= -2) return { severity: 3, category: "Tension" };
  if (gs <= 0) return { severity: 2, category: "Concern" };
  return { severity: 1, category: "Monitoring" };
}

function buildHeadline(
  actor1: string,
  actor2: string,
  eventCode: string,
): string {
  const a1 = actor1 || "Unknown actor";
  const a2 = actor2 ? ` → ${actor2}` : "";
  return `${a1}${a2} [${eventCode}]`;
}

function parseExportCsv(csv: string): GdeltEvent[] {
  const lines = csv.split("\n");
  const events: GdeltEvent[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 58) continue;

    // Filter to conflict/crisis CAMEO root codes
    // 10=Demand, 13=Threaten, 14=Protest, 15=Military posture,
    // 17=Coerce, 18=Assault, 19=Fight, 20=Unconventional mass violence
    const rootCode = cols[COL.EventRootCode]?.trim();
    if (!rootCode || !RELEVANT_ROOT_CODES.has(rootCode)) continue;

    // Must have lat/lon
    const lat = parseFloat(cols[COL.ActionGeo_Lat] ?? "");
    const lon = parseFloat(cols[COL.ActionGeo_Long] ?? "");
    if (!isFinite(lat) || !isFinite(lon)) continue;
    if (lat === 0 && lon === 0) continue; // skip null island

    const goldstein = parseFloat(cols[COL.GoldsteinScale] ?? "0");
    const tone = parseFloat(cols[COL.AvgTone] ?? "0");
    const mentions = parseInt(cols[COL.NumMentions] ?? "1", 10);
    const { severity, category } = goldsteinToSeverity(
      isFinite(goldstein) ? goldstein : 0,
    );

    const actor1 = cols[COL.Actor1Name]?.trim() ?? "";
    const actor2 = cols[COL.Actor2Name]?.trim() ?? "";
    const eventCode =
      cols[COL.EventCode]?.trim() ?? cols[COL.EventRootCode]?.trim() ?? "";
    const sourceUrl = cols[COL.SOURCEURL]?.trim() ?? "";
    const dateAdded = cols[COL.DATEADDED]?.trim() ?? "";
    const locationName = cols[COL.ActionGeo_Fullname]?.trim() ?? "";
    const countryCode = cols[COL.ActionGeo_CountryCode]?.trim() ?? "";
    const globalEventId = cols[COL.GlobalEventID]?.trim() ?? "";

    events.push({
      id: globalEventId,
      lat,
      lon,
      timestamp: parseDateAdded(dateAdded),
      headline: buildHeadline(actor1, actor2, eventCode),
      actor1,
      actor2,
      eventCode,
      goldstein: isFinite(goldstein) ? goldstein : 0,
      tone: isFinite(tone) ? tone : 0,
      mentions,
      locationName,
      countryCode,
      sourceUrl,
      severity,
      category,
    });
  }

  return events;
}

// ── Convert to GeoJSON for client compatibility ──────────────────────
// The client already parses GeoJSON format, so we wrap events in that.

function toGeoJSON(events: GdeltEvent[]): object {
  return {
    type: "FeatureCollection",
    features: events.map((e) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [e.lon, e.lat],
      },
      properties: {
        name: e.locationName,
        url: e.sourceUrl,
        urltone: String(e.tone),
        urlpubtimedate: e.timestamp,
        domain: e.sourceUrl
          ? new URL(e.sourceUrl).hostname.replace(/^www\./, "")
          : undefined,
        html: `<a href="${e.sourceUrl}">${e.headline}</a>`,
        urlsourcecountry: e.countryCode,
        goldstein: e.goldstein,
        mentions: e.mentions,
        actor1: e.actor1,
        actor2: e.actor2,
        eventCode: e.eventCode,
        severity: e.severity,
        category: e.category,
      },
    })),
  };
}

// ── Cache state ──────────────────────────────────────────────────────

type GdeltCache = {
  data: object | null;
  fetchedAt: number;
  eventCount: number;
  error: string | null;
  lastExportUrl: string | null;
};

let cache: GdeltCache = {
  data: null,
  fetchedAt: 0,
  eventCount: 0,
  error: null,
  lastExportUrl: null,
};

let intervalId: ReturnType<typeof setInterval> | null = null;

// ── Fetch pipeline ───────────────────────────────────────────────────

async function fetchGdelt(): Promise<void> {
  try {
    // 1. Get latest update file list
    const updateRes = await fetch(LASTUPDATE_URL);
    if (!updateRes.ok) {
      cache = {
        ...cache,
        error: `lastupdate.txt returned ${updateRes.status}`,
      };
      return;
    }

    const updateText = await updateRes.text();
    const lines = updateText.trim().split("\n");

    // Find the .export.CSV.zip line
    const exportLine = lines.find((l) => l.includes(".export.CSV.zip"));
    if (!exportLine) {
      cache = { ...cache, error: "No export file found in lastupdate.txt" };
      return;
    }

    const exportUrl = exportLine.split(" ").pop()?.trim();
    if (!exportUrl) {
      cache = { ...cache, error: "Could not parse export URL" };
      return;
    }

    // Skip if we already fetched this exact file
    if (exportUrl === cache.lastExportUrl && cache.data) return;

    // 2. Download the zip
    const zipRes = await fetch(exportUrl);
    if (!zipRes.ok) {
      cache = { ...cache, error: `Export download failed: ${zipRes.status}` };
      return;
    }

    const zipBuffer = await zipRes.arrayBuffer();

    // 3. Extract CSV from zip
    const csv = await extractZipFirstFile(zipBuffer);

    // 4. Parse events
    const events = parseExportCsv(csv);

    // 5. Convert to GeoJSON and cache
    const geojson = toGeoJSON(events);

    cache = {
      data: geojson,
      fetchedAt: Date.now(),
      eventCount: events.length,
      error: null,
      lastExportUrl: exportUrl,
    };
  } catch (err) {
    cache = {
      ...cache,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function startGdeltPolling(): void {
  if (intervalId) return;
  fetchGdelt();
  intervalId = setInterval(fetchGdelt, POLL_INTERVAL_MS);
}

export function stopGdeltPolling(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function getGdeltCache(): {
  data: object | null;
  fetchedAt: number;
  eventCount: number;
  error: string | null;
} {
  return {
    data: cache.data,
    fetchedAt: cache.fetchedAt,
    eventCount: cache.eventCount,
    error: cache.error,
  };
}
