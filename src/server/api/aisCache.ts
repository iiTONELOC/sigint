import { createLogger } from "../lib/logger";
import { errorMessage } from "../lib/errorMessage";
import { isUsableCoordinate } from "../lib/geoValidation";
import {
  AisNavigationStatus,
  type AisVesselRecord,
} from "@shared/domain/ships";
import {
  HOURS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from "@shared/time";
import { GeoLimit, isRecord } from "@shared/geo";
import { isNumberEnumValue } from "@shared/types/enum";
import { optionalFiniteNumber } from "@shared/types/numbers";
import WebSocket, { type RawData } from "ws";
import * as https from "https";

const logger = createLogger({ service: "ais" });

const AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream";
const RECONNECT_DELAY_MS = 10 * MS_PER_SECOND;
const PRUNE_INTERVAL_MS = 5 * MS_PER_MINUTE;
const MAX_VESSEL_AGE_MS = MS_PER_HOUR;
const AIS_TEXT_PADDING = "@";

export enum AisMessageType {
  PositionReport = "PositionReport",
  ShipStaticData = "ShipStaticData",
}

const ETA_MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul",
  "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatEta(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const month = optionalFiniteNumber(value.Month) ?? 0;
  const day = optionalFiniteNumber(value.Day) ?? 0;
  const maximumDay = 31;
  const fieldWidth = 2;
  const unavailableField = "00";
  if (month < 1 || month >= ETA_MONTHS.length || day < 1 || day > maximumDay) return undefined;
  const hour = optionalFiniteNumber(value.Hour);
  const minute = optionalFiniteNumber(value.Minute);
  const hourText = hour !== undefined && hour < HOURS_PER_DAY
    ? String(hour).padStart(fieldWidth, "0") : unavailableField;
  const minuteText = minute !== undefined && minute < SECONDS_PER_MINUTE
    ? String(minute).padStart(fieldWidth, "0") : unavailableField;
  return `${ETA_MONTHS[month]} ${day} ${hourText}:${minuteText}`;
}

export function normalizeAisText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === AIS_TEXT_PADDING) end -= 1;
  const normalized = trimmed.slice(0, end);
  return normalized || undefined;
}

function parseAisMessage(raw: RawData): unknown {
  let bytes: Buffer;
  if (Array.isArray(raw)) bytes = Buffer.concat(raw);
  else if (raw instanceof ArrayBuffer) bytes = Buffer.from(raw);
  else bytes = raw;
  return JSON.parse(bytes.toString("utf8"));
}

const vessels = new Map<number, AisVesselRecord>();
let wsConnection: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let lastError: string | null = null;
let messageCount = 0;

let configuredApiKey: string | undefined;

function connect(): void {
  if (!started) return;
  const apiKey = configuredApiKey;
  if (!apiKey) {
    lastError = "AISSTREAM_API_KEY not configured: ships data unavailable";
    logger.warn("🚢 AIS: no API key set, skipping");
    return;
  }

  logger.info("🚢 AIS: connecting to aisstream.io...");

  try {
    const agent = new https.Agent({ rejectUnauthorized: true });
    const ws = new WebSocket(AISSTREAM_WS_URL, { agent });
    wsConnection = ws;

    ws.on("open", () => {
      if (!started) {
        ws.close();
        return;
      }
      lastError = null;
      const subscription = {
        APIKey: apiKey,
        BoundingBoxes: [
          [
            [GeoLimit.MinLatitude, GeoLimit.MinLongitude],
            [GeoLimit.MaxLatitude, GeoLimit.MaxLongitude],
          ],
        ],
        FilterMessageTypes: [AisMessageType.PositionReport, AisMessageType.ShipStaticData],
      };
      ws.send(JSON.stringify(subscription));
      logger.info("🚢 AIS: WebSocket connected, subscription sent");
    });

    ws.on("message", (raw: RawData) => {
      try {
        const message = parseAisMessage(raw);
        messageCount++;
        if (messageCount === 1) logger.info("🚢 AIS: first message received");
        handleAisMessage(message);
      } catch {
        logger.warn("🚢 AIS: skipped a malformed message");
      }
    });

    ws.on("close", (code: number, reason: Buffer) => {
      const why = reason.length ? `: ${reason.toString("utf8")}` : "";
      logger.warn(`🚢 AIS: WebSocket closed (code: ${code})${why}`);
      wsConnection = null;
      scheduleReconnect();
    });

    ws.on("error", (err: Error) => {
      lastError = `ws error: ${err.message}`;
      logger.error(`🚢 AIS: ${lastError}`);
    });
  } catch (err) {
    lastError = errorMessage(err, "Connection failed");
    logger.error(`🚢 AIS: connection failed: ${lastError}`);
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (!started || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

export function handlePositionReport(
  message: Readonly<Record<string, unknown>>,
  metadata: Readonly<Record<string, unknown>>,
  mmsi: number,
  now: number,
): void {
  if (!isRecord(message.Message)) return;
  const report = message.Message[AisMessageType.PositionReport];
  if (!isRecord(report)) return;
  const latitude = optionalFiniteNumber(report.Latitude) ?? optionalFiniteNumber(metadata.latitude);
  const longitude = optionalFiniteNumber(report.Longitude) ?? optionalFiniteNumber(metadata.longitude);
  if (latitude === undefined || longitude === undefined) return;
  if (!isUsableCoordinate(latitude, longitude)) return;

  const previous = vessels.get(mmsi);
  vessels.set(mmsi, {
    ...previous,
    mmsi,
    lat: latitude,
    lon: longitude,
    sog: optionalFiniteNumber(report.Sog) ?? previous?.sog ?? 0,
    cog: optionalFiniteNumber(report.Cog) ?? previous?.cog ?? 0,
    heading: optionalFiniteNumber(report.TrueHeading) ?? previous?.heading ?? 0,
    navStatus: isNumberEnumValue(
      report.NavigationalStatus,
      AisNavigationStatus,
    ) ? report.NavigationalStatus
      : previous?.navStatus ?? AisNavigationStatus.NotDefined,
    rot: optionalFiniteNumber(report.RateOfTurn) ?? previous?.rot,
    name: previous?.name ?? normalizeAisText(metadata.ShipName),
    lastSeen: now,
  });
}

export function handleShipStaticData(
  message: Readonly<Record<string, unknown>>,
  metadata: Readonly<Record<string, unknown>>,
  mmsi: number,
  now: number,
): void {
  if (!isRecord(message.Message)) return;
  const staticData = message.Message[AisMessageType.ShipStaticData];
  if (!isRecord(staticData)) return;

  const previous = vessels.get(mmsi);
  const latitude = previous?.lat ?? optionalFiniteNumber(metadata.latitude);
  const longitude = previous?.lon ?? optionalFiniteNumber(metadata.longitude);
  if (latitude === undefined || longitude === undefined) return;
  if (!isUsableCoordinate(latitude, longitude)) return;

  const imo = optionalFiniteNumber(staticData.ImoNumber);
  const draught = optionalFiniteNumber(staticData.MaximumStaticDraught);
  const dimensions = isRecord(staticData.Dimension) ? staticData.Dimension : null;
  vessels.set(mmsi, {
    ...previous,
    mmsi,
    lat: latitude,
    lon: longitude,
    sog: previous?.sog ?? 0,
    cog: previous?.cog ?? 0,
    heading: previous?.heading ?? 0,
    navStatus: previous?.navStatus ?? AisNavigationStatus.NotDefined,
    lastSeen: now,
    name: normalizeAisText(staticData.Name) ?? previous?.name ?? normalizeAisText(metadata.ShipName),
    callSign: normalizeAisText(staticData.CallSign) ?? previous?.callSign,
    imo: imo !== undefined && Number.isSafeInteger(imo) && imo > 0
      ? imo
      : previous?.imo,
    shipTypeCode: optionalFiniteNumber(staticData.Type) ?? previous?.shipTypeCode,
    destination: normalizeAisText(staticData.Destination) ?? previous?.destination,
    draught: draught !== undefined && draught > 0
      ? draught
      : previous?.draught,
    eta: formatEta(staticData.Eta) ?? previous?.eta,
    dimA: optionalFiniteNumber(dimensions?.A) ?? previous?.dimA,
    dimB: optionalFiniteNumber(dimensions?.B) ?? previous?.dimB,
    dimC: optionalFiniteNumber(dimensions?.C) ?? previous?.dimC,
    dimD: optionalFiniteNumber(dimensions?.D) ?? previous?.dimD,
  });
}

function handleAisMessage(value: unknown): void {
  if (!isRecord(value) || !isRecord(value.MetaData)) return;
  const mmsi = optionalFiniteNumber(value.MetaData.MMSI);
  if (mmsi === undefined || !Number.isSafeInteger(mmsi) || mmsi <= 0) {
    return;
  }
  const now = Date.now();
  if (value.MessageType === AisMessageType.PositionReport) {
    handlePositionReport(value, value.MetaData, mmsi, now);
  } else if (value.MessageType === AisMessageType.ShipStaticData) {
    handleShipStaticData(value, value.MetaData, mmsi, now);
  }
}

function pruneStale(): void {
  const cutoff = Date.now() - MAX_VESSEL_AGE_MS;
  for (const [mmsi, vessel] of vessels) {
    if (vessel.lastSeen < cutoff) vessels.delete(mmsi);
  }
}

export function startAisPolling(apiKey: string | undefined): void {
  if (started) return;
  started = true;
  configuredApiKey = apiKey;
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
  data: readonly AisVesselRecord[] | null;
  vesselCount: number;
  messageCount: number;
  error: string | null;
  connected: boolean;
} {
  const data = vessels.size > 0 ? Array.from(vessels.values()) : null;
  return {
    data,
    vesselCount: vessels.size,
    messageCount,
    error: lastError,
    connected: wsConnection?.readyState === WebSocket.OPEN,
  };
}

export function __resetAisCacheForTests(): void {
  vessels.clear();
  lastError = null;
  messageCount = 0;
}
