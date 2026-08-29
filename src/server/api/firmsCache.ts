import {
  fetchWithTimeout,
  FETCH_TIMEOUT_LARGE_MS,
} from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { createPoller } from "../lib/poller";
import { errorMessage } from "../lib/errorMessage";
import { isFiniteCoordinate, isNullIsland } from "../lib/geoValidation";
import type { FireRecord } from "@shared/domain/fireDayNight";
import { MS_PER_MINUTE } from "@shared/time";

const logger = createLogger({ service: "firms" });

const FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov";
const FIRMS_POLL_INTERVAL_MS = 30 * MS_PER_MINUTE;
const FIRMS_RESPONSE_PREVIEW_LENGTH = 120;
const FIRMS_DEFAULT_INSTRUMENT = "VIIRS";
const COMPLEX_CELL_DEGREES = 0.02;
const COMPLEX_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

enum FirmsFeed {
  Noaa20 = "NOAA-20",
  SuomiNpp = "S-NPP",
  Noaa21 = "NOAA-21",
}

const FIRMS_BULK_FEED_URLS: Readonly<Record<FirmsFeed, string>> = {
  [FirmsFeed.Noaa20]: `${FIRMS_BASE_URL}/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv`,
  [FirmsFeed.SuomiNpp]: `${FIRMS_BASE_URL}/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv`,
  [FirmsFeed.Noaa21]: `${FIRMS_BASE_URL}/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv`,
};

enum FirmsCsvColumn {
  AcquisitionDate = "acq_date",
  AcquisitionTime = "acq_time",
  Brightness = "brightness",
  BrightT31 = "bright_t31",
  Confidence = "confidence",
  DayNight = "daynight",
  Frp = "frp",
  Instrument = "instrument",
  Latitude = "latitude",
  Longitude = "longitude",
  Satellite = "satellite",
  Scan = "scan",
  Track = "track",
  Version = "version",
  ViirsBrightness = "bright_ti4",
  ViirsBrightT31 = "bright_ti5",
}

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

function columnIndex(
  header: readonly string[],
  primary: FirmsCsvColumn,
  fallback?: FirmsCsvColumn,
): number {
  const primaryIndex = header.indexOf(primary);
  return primaryIndex >= 0 || fallback === undefined
    ? primaryIndex
    : header.indexOf(fallback);
}

function firmsColumnIndexes(header: readonly string[]) {
  const latitude = columnIndex(header, FirmsCsvColumn.Latitude);
  const longitude = columnIndex(header, FirmsCsvColumn.Longitude);
  if (latitude < 0 || longitude < 0) return null;
  return {
    acquisitionDate: columnIndex(header, FirmsCsvColumn.AcquisitionDate),
    acquisitionTime: columnIndex(header, FirmsCsvColumn.AcquisitionTime),
    brightness: columnIndex(
      header,
      FirmsCsvColumn.ViirsBrightness,
      FirmsCsvColumn.Brightness,
    ),
    brightT31: columnIndex(
      header,
      FirmsCsvColumn.ViirsBrightT31,
      FirmsCsvColumn.BrightT31,
    ),
    confidence: columnIndex(header, FirmsCsvColumn.Confidence),
    dayNight: columnIndex(header, FirmsCsvColumn.DayNight),
    frp: columnIndex(header, FirmsCsvColumn.Frp),
    instrument: columnIndex(header, FirmsCsvColumn.Instrument),
    latitude,
    longitude,
    satellite: columnIndex(header, FirmsCsvColumn.Satellite),
    scan: columnIndex(header, FirmsCsvColumn.Scan),
    track: columnIndex(header, FirmsCsvColumn.Track),
    version: columnIndex(header, FirmsCsvColumn.Version),
  };
}

type FirmsColumnIndexes = NonNullable<ReturnType<typeof firmsColumnIndexes>>;

function numericColumn(columns: readonly string[], index: number): number {
  if (index < 0) return 0;
  const parsed = Number.parseFloat(columns[index] ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function textColumn(columns: readonly string[], index: number): string {
  return index >= 0 ? (columns[index]?.trim() ?? "") : "";
}

function parseFirmsRow(
  line: string,
  headerLength: number,
  indexes: FirmsColumnIndexes,
): FireRecord | null {
  const columns = line.trim().split(",");
  if (columns.length < headerLength) return null;
  const lat = Number.parseFloat(columns[indexes.latitude] ?? "");
  const lon = Number.parseFloat(columns[indexes.longitude] ?? "");
  if (!isFiniteCoordinate(lat, lon) || isNullIsland(lat, lon)) return null;
  return {
    lat,
    lon,
    brightness: numericColumn(columns, indexes.brightness),
    scan: numericColumn(columns, indexes.scan),
    track: numericColumn(columns, indexes.track),
    acqDate: textColumn(columns, indexes.acquisitionDate),
    acqTime: textColumn(columns, indexes.acquisitionTime),
    satellite: textColumn(columns, indexes.satellite),
    instrument: indexes.instrument >= 0
      ? textColumn(columns, indexes.instrument)
      : FIRMS_DEFAULT_INSTRUMENT,
    confidence: textColumn(columns, indexes.confidence),
    version: textColumn(columns, indexes.version),
    brightT31: numericColumn(columns, indexes.brightT31),
    frp: numericColumn(columns, indexes.frp),
    daynight: textColumn(columns, indexes.dayNight),
  };
}

export function parseFirmsCsv(csv: string): FireRecord[] {
  const lines = csv.split("\n");
  const headerLine = lines[0];
  if (!headerLine || lines.length < 2) return [];
  const header = headerLine.trim().toLowerCase().split(",");
  const indexes = firmsColumnIndexes(header);
  if (!indexes) return [];
  const records: FireRecord[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const record = parseFirmsRow(line, header.length, indexes);
    if (record) records.push(record);
  }
  return records;
}

async function fetchOneSource(feed: FirmsFeed): Promise<FireRecord[] | null> {
  try {
    const response = await fetchWithTimeout(
      FIRMS_BULK_FEED_URLS[feed],
      FETCH_TIMEOUT_LARGE_MS,
    );
    if (!response.ok) {
      logger.warn(`🔥 FIRMS: ${feed} returned ${response.status}`);
      return null;
    }
    const body = await response.text();
    if (!body.toLowerCase().includes(FirmsCsvColumn.Latitude)) {
      logger.warn(
        `🔥 FIRMS: ${feed} non-CSV response: ${body.slice(0, FIRMS_RESPONSE_PREVIEW_LENGTH)}`,
      );
      return null;
    }
    return parseFirmsCsv(body);
  } catch (error_) {
    logger.warn(
      `🔥 FIRMS: ${feed} fetch failed: ${errorMessage(error_, "unknown")}`,
    );
    return null;
  }
}

type FireComplexStats = { count: number; frp: number };

function fireCellKey(record: FireRecord): string {
  return `${Math.round(record.lat / COMPLEX_CELL_DEGREES)}:${Math.round(record.lon / COMPLEX_CELL_DEGREES)}`;
}

function findCellRoot(parent: Map<string, string>, cell: string): string {
  let root = cell;
  while ((parent.get(root) ?? root) !== root) root = parent.get(root) ?? root;
  let current = cell;
  while (current !== root) {
    const next = parent.get(current) ?? current;
    parent.set(current, root);
    current = next;
  }
  return root;
}

function joinCells(
  parent: Map<string, string>,
  left: string,
  right: string,
): void {
  const leftRoot = findCellRoot(parent, left);
  const rightRoot = findCellRoot(parent, right);
  if (leftRoot !== rightRoot) parent.set(leftRoot, rightRoot);
}

function applyComplexSummaries(
  cells: ReadonlyMap<string, readonly FireRecord[]>,
  parent: Map<string, string>,
  summaries: ReadonlyMap<string, FireComplexStats>,
): void {
  for (const [key, records] of cells) {
    const summary = summaries.get(findCellRoot(parent, key));
    if (!summary) continue;
    for (const record of records) {
      record.complexSize = summary.count;
      record.complexFrp = Math.round(summary.frp);
    }
  }
}

function clusterFires(records: FireRecord[]): void {
  const cells = new Map<string, FireRecord[]>();
  for (const record of records) {
    const key = fireCellKey(record);
    const cell = cells.get(key);
    if (cell) cell.push(record);
    else cells.set(key, [record]);
  }

  const parent = new Map<string, string>();
  for (const key of cells.keys()) {
    const [xText, yText] = key.split(":");
    const x = Number(xText);
    const y = Number(yText);
    for (const [xOffset, yOffset] of COMPLEX_NEIGHBOR_OFFSETS) {
      const neighbor = `${x + xOffset}:${y + yOffset}`;
      if (cells.has(neighbor)) joinCells(parent, key, neighbor);
    }
  }

  const summaries = new Map<string, FireComplexStats>();
  for (const [key, cell] of cells) {
    const root = findCellRoot(parent, key);
    const summary = summaries.get(root) ?? { count: 0, frp: 0 };
    summary.count += cell.length;
    for (const record of cell) summary.frp += record.frp;
    summaries.set(root, summary);
  }
  applyComplexSummaries(cells, parent, summaries);
}

async function fetchFirms(): Promise<void> {
  try {
    for (const feed of Object.values(FirmsFeed)) {
      const rows = await fetchOneSource(feed);
      if (rows && rows.length > 0) {
        clusterFires(rows);
        cache = {
          data: rows,
          fetchedAt: Date.now(),
          fireCount: rows.length,
          error: null,
        };
        logger.info(`🔥 FIRMS: ${rows.length} hotspots loaded (${feed})`);
        return;
      }
    }

    logger.info("🔥 FIRMS: no feed returned data; retaining stale cache");
    cache = { ...cache, error: "All FIRMS feeds empty/failed" };
  } catch (err) {
    cache = {
      ...cache,
      error: errorMessage(err, "Unknown fetch error"),
    };
  }
}

const poller = createPoller(fetchFirms, FIRMS_POLL_INTERVAL_MS);

export function startFirmsPolling(): void {
  logger.info(
    `🔥 FIRMS: starting poll (${Object.values(FirmsFeed).length} VIIRS bulk feeds in failover order, last 24h)...`,
  );
  poller.start();
}

export function stopFirmsPolling(): void {
  poller.stop();
}

export function getFirmsCache(): FirmsCache {
  return {
    data: cache.data,
    fetchedAt: cache.fetchedAt,
    fireCount: cache.fireCount,
    error: cache.error,
  };
}

export function __resetFirmsCacheForTests(): void {
  cache = { data: null, fetchedAt: 0, fireCount: 0, error: null };
}
