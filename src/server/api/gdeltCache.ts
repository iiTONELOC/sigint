import { IntelSeverity } from "@shared/domain/correlation";
import {
  EventApiMessage,
  type GdeltEvent,
} from "@shared/domain/events";
import { MS_PER_MINUTE } from "@shared/time";
import {
  FETCH_TIMEOUT_LARGE_MS,
  FETCH_TIMEOUT_STANDARD_MS,
  fetchWithTimeout,
} from "../lib/fetchWithTimeout";
import { isFiniteCoordinate, isNullIsland } from "../lib/geoValidation";
import { createLogger } from "../lib/logger";
import { createPoller } from "../lib/poller";
import { unzipSingleEntryKmz } from "./zipReader";

enum GdeltService {
  Name = "gdelt",
}

enum GdeltEndpoint {
  LastUpdate = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt",
}

enum GdeltPolling {
  IntervalMinutes = 15,
}

enum GdeltDateFormat {
  IsoReplacement = "$1-$2-$3T$4:$5:$6Z",
}

enum GdeltArchive {
  ExportMarker = ".export.CSV.zip",
}

enum GdeltCopy {
  UnknownActor = "Unknown actor",
  TargetSeparator = " → ",
}

enum GdeltColumn {
  Actor1Name = 6,
  Actor2Name = 16,
  EventCode = 26,
  EventRootCode = 28,
  GoldsteinScale = 30,
  NumMentions = 31,
  AverageTone = 34,
  ActionGeoFullName = 44,
  ActionGeoCountryCode = 45,
  ActionGeoLatitude = 48,
  ActionGeoLongitude = 49,
  DateAdded = 59,
  SourceUrl = 60,
}

enum GdeltRootCode {
  Demand = "10",
  Threaten = "13",
  Protest = "14",
  MilitaryPosture = "15",
  Coerce = "17",
  Assault = "18",
  Fight = "19",
  MassViolence = "20",
}

enum GdeltGoldsteinThreshold {
  Crisis = -7,
  Conflict = -4,
  Tension = -2,
  Concern = 0,
}

enum GdeltDefault {
  Numeric = 0,
  Mentions = 1,
  DecimalRadix = 10,
}

enum GdeltDiagnostic {
  LastUpdateRequest = "GDELT lastupdate request failed",
  MissingExport = "GDELT lastupdate response contained no export file",
  InvalidExportUrl = "GDELT export URL could not be parsed",
  ExportRequest = "GDELT export request failed",
  EmptyExport = "GDELT upstream returned no events; retaining stale cache",
  Refresh = "GDELT refresh failed",
  UnknownFailure = "Unknown GDELT refresh failure",
}

const logger = createLogger({ service: GdeltService.Name });
const GDELT_DATE_PATTERN =
  /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2}).*$/;
const WWW_PREFIX_PATTERN = /^www\./;
const RELEVANT_ROOT_CODES: ReadonlySet<string> = new Set(
  Object.values(GdeltRootCode),
);

function parseDateAdded(value: string): string {
  if (!GDELT_DATE_PATTERN.test(value)) return new Date().toISOString();
  return new Date(
    value.replace(GDELT_DATE_PATTERN, GdeltDateFormat.IsoReplacement),
  ).toISOString();
}

function goldsteinSeverity(goldstein: number): IntelSeverity {
  if (goldstein <= GdeltGoldsteinThreshold.Crisis) {
    return IntelSeverity.Crisis;
  }
  if (goldstein <= GdeltGoldsteinThreshold.Conflict) {
    return IntelSeverity.Conflict;
  }
  if (goldstein <= GdeltGoldsteinThreshold.Tension) {
    return IntelSeverity.Tension;
  }
  if (goldstein <= GdeltGoldsteinThreshold.Concern) {
    return IntelSeverity.Concern;
  }
  return IntelSeverity.Monitoring;
}

function buildHeadline(
  actor1: string,
  actor2: string,
  eventCode: string,
): string {
  const sourceActor = actor1 || GdeltCopy.UnknownActor;
  const targetActor = actor2
    ? `${GdeltCopy.TargetSeparator}${actor2}`
    : "";
  return `${sourceActor}${targetActor} [${eventCode}]`;
}

function finiteDecimal(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finiteInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", GdeltDefault.DecimalRadix);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sourceDomain(sourceUrl: string): string | undefined {
  return sourceUrl
    ? new URL(sourceUrl).hostname.replace(WWW_PREFIX_PATTERN, "")
    : undefined;
}

function parseExportCsv(csv: string): GdeltEvent[] {
  const events: GdeltEvent[] = [];

  for (const line of csv.split("\n")) {
    if (!line.trim()) continue;
    const columns = line.split("\t");
    if (columns.length <= GdeltColumn.SourceUrl) continue;

    const rootCode = columns[GdeltColumn.EventRootCode]?.trim();
    if (!rootCode || !RELEVANT_ROOT_CODES.has(rootCode)) continue;

    const lat = Number.parseFloat(
      columns[GdeltColumn.ActionGeoLatitude] ?? "",
    );
    const lon = Number.parseFloat(
      columns[GdeltColumn.ActionGeoLongitude] ?? "",
    );
    if (!isFiniteCoordinate(lat, lon) || isNullIsland(lat, lon)) continue;

    const goldstein = finiteDecimal(
      columns[GdeltColumn.GoldsteinScale],
      GdeltDefault.Numeric,
    );
    const tone = finiteDecimal(
      columns[GdeltColumn.AverageTone],
      GdeltDefault.Numeric,
    );
    const mentions = finiteInteger(
      columns[GdeltColumn.NumMentions],
      GdeltDefault.Mentions,
    );
    const actor1 = columns[GdeltColumn.Actor1Name]?.trim() ?? "";
    const actor2 = columns[GdeltColumn.Actor2Name]?.trim() ?? "";
    const eventCode = columns[GdeltColumn.EventCode]?.trim() ?? rootCode;
    const sourceUrl = columns[GdeltColumn.SourceUrl]?.trim() ?? "";
    const severity = goldsteinSeverity(goldstein);

    events.push({
      lat,
      lon,
      timestamp: parseDateAdded(
        columns[GdeltColumn.DateAdded]?.trim() ?? "",
      ),
      data: {
        headline: buildHeadline(actor1, actor2, eventCode),
        category: IntelSeverity[severity],
        source: sourceDomain(sourceUrl),
        sourceCountry:
          columns[GdeltColumn.ActionGeoCountryCode]?.trim() ?? "",
        url: sourceUrl,
        tone,
        severity,
        locationName:
          columns[GdeltColumn.ActionGeoFullName]?.trim() ?? "",
        goldstein,
        mentions,
        actor1: actor1 || undefined,
        actor2: actor2 || undefined,
      },
    });
  }

  return events;
}

type GdeltCache = {
  data: readonly GdeltEvent[] | null;
  fetchedAt: number;
  error: string | null;
  lastExportUrl: string | null;
};

let cache: GdeltCache = {
  data: null,
  fetchedAt: 0,
  error: null,
  lastExportUrl: null,
};

function recordFailure(
  message: GdeltDiagnostic,
  fields?: Record<string, unknown>,
): void {
  logger.warn(message, fields);
  cache = { ...cache, error: EventApiMessage.Unavailable };
}

async function fetchGdelt(): Promise<void> {
  try {
    const updateResponse = await fetchWithTimeout(
      GdeltEndpoint.LastUpdate,
      FETCH_TIMEOUT_STANDARD_MS,
    );
    if (!updateResponse.ok) {
      recordFailure(GdeltDiagnostic.LastUpdateRequest, {
        statusCode: updateResponse.status,
      });
      return;
    }

    const exportLine = (await updateResponse.text())
      .trim()
      .split("\n")
      .find((line) => line.includes(GdeltArchive.ExportMarker));
    if (!exportLine) {
      recordFailure(GdeltDiagnostic.MissingExport);
      return;
    }

    const exportUrl = exportLine.split(" ").pop()?.trim();
    if (!exportUrl) {
      recordFailure(GdeltDiagnostic.InvalidExportUrl);
      return;
    }
    if (exportUrl === cache.lastExportUrl && cache.data) return;

    const exportResponse = await fetchWithTimeout(
      exportUrl,
      FETCH_TIMEOUT_LARGE_MS,
    );
    if (!exportResponse.ok) {
      recordFailure(GdeltDiagnostic.ExportRequest, {
        statusCode: exportResponse.status,
      });
      return;
    }

    const csv = await unzipSingleEntryKmz(
      new Uint8Array(await exportResponse.arrayBuffer()),
    );
    const events = parseExportCsv(csv);

    if (events.length === 0 && cache.data) {
      recordFailure(GdeltDiagnostic.EmptyExport);
      return;
    }

    cache = {
      data: events,
      fetchedAt: Date.now(),
      error: null,
      lastExportUrl: exportUrl,
    };
  } catch (cause) {
    const error =
      cause instanceof Error
        ? cause
        : new Error(GdeltDiagnostic.UnknownFailure);
    logger.error(GdeltDiagnostic.Refresh, { error });
    cache = { ...cache, error: EventApiMessage.Unavailable };
  }
}

const poller = createPoller(
  fetchGdelt,
  GdeltPolling.IntervalMinutes * MS_PER_MINUTE,
);

export function startGdeltPolling(): void {
  poller.start();
}

export function getGdeltCache(): {
  data: readonly GdeltEvent[] | null;
  fetchedAt: number;
  error: string | null;
} {
  return {
    data: cache.data,
    fetchedAt: cache.fetchedAt,
    error: cache.error,
  };
}

/** TEST-ONLY: reset module state to the initial empty shape. */
export function __resetGdeltCacheForTests(): void {
  cache = {
    data: null,
    fetchedAt: 0,
    error: null,
    lastExportUrl: null,
  };
}
