import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import type { FireData } from "@/features/environmental/fires/types";
import { authenticatedFetch } from "@/lib/net/authService";
import { createGeoPoint, isRecord } from "@shared/geo";
import { MS_PER_MINUTE } from "@shared/time";

export type FirePoint = Extract<DataPoint, { type: Domain.Fires }>;

export type FireFeedPolicy = Readonly<{
  feedUrl: string;
  retryIntervalMs: number;
  requestTimeoutMs: number;
}>;

export enum FireFeedErrorKind {
  InvalidResponse = "The fires response format is invalid",
  RequestRejected = "The fires endpoint rejected the request",
}

export class FireFetchError extends Error {
  readonly httpStatus: number | null;
  readonly kind: FireFeedErrorKind;

  constructor(
    kind: FireFeedErrorKind,
    httpStatus: number | null = null,
  ) {
    super(kind);
    this.name = FireFetchError.name;
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

export function isFireFetchError(value: unknown): value is FireFetchError {
  return value instanceof FireFetchError;
}

export function fireFetchError(httpStatus: number): FireFetchError {
  return new FireFetchError(
    FireFeedErrorKind.RequestRejected,
    httpStatus,
  );
}

export const FIRE_FEED_POLICY: FireFeedPolicy = {
  feedUrl: "/api/fires/latest",
  retryIntervalMs: MS_PER_MINUTE,
  requestTimeoutMs: 20_000,
};

enum FireConfidenceCode {
  High = "high",
  HighShort = "h",
  Nominal = "nominal",
  NominalShort = "n",
}

export enum FireConfidenceLevel {
  Low = 0,
  Nominal = 1,
  High = 2,
}

enum FireIdentityToken {
  Prefix = "FI",
  UnknownSatellite = "unknown",
  Separator = ":",
  Empty = "",
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function fireConfidenceLevel(
  confidence: string | undefined,
): FireConfidenceLevel {
  const normalized = confidence?.toLowerCase();
  if (
    normalized === FireConfidenceCode.High ||
    normalized === FireConfidenceCode.HighShort
  ) {
    return FireConfidenceLevel.High;
  }
  if (
    normalized === FireConfidenceCode.Nominal ||
    normalized === FireConfidenceCode.NominalShort
  ) {
    return FireConfidenceLevel.Nominal;
  }
  return FireConfidenceLevel.Low;
}

function parseFireData(value: unknown): FireData | null {
  if (!isRecord(value)) return null;
  return {
    brightness: optionalFiniteNumber(value.brightness),
    frp: optionalFiniteNumber(value.frp),
    confidence: optionalString(value.confidence),
    satellite: optionalString(value.satellite),
    instrument: optionalString(value.instrument),
    scan: optionalFiniteNumber(value.scan),
    track: optionalFiniteNumber(value.track),
    brightT31: optionalFiniteNumber(value.brightT31),
    daynight: optionalString(value.daynight),
    acqDate: optionalString(value.acqDate),
    acqTime: optionalString(value.acqTime),
    complexSize: optionalFiniteNumber(value.complexSize),
    complexFrp: optionalFiniteNumber(value.complexFrp),
  };
}

export function parseFirePoint(value: unknown): FirePoint | null {
  if (
    !isRecord(value) ||
    value.type !== Domain.Fires ||
    typeof value.id !== "string" ||
    typeof value.lat !== "number" ||
    typeof value.lon !== "number"
  ) {
    return null;
  }
  const coordinate = createGeoPoint(value.lon, value.lat);
  const data = parseFireData(value.data);
  if (!coordinate || !data) return null;
  const timestamp =
    typeof value.timestamp === "string" ? value.timestamp : undefined;
  return {
    id: value.id,
    type: Domain.Fires,
    lat: coordinate[1],
    lon: coordinate[0],
    ...(timestamp ? { timestamp } : {}),
    data,
  };
}

function acquisitionTimestamp(
  acquisitionDate: string,
  acquisitionTime: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)) return null;
  if (!/^\d{4}$/.test(acquisitionTime)) return null;
  const timestamp = Date.parse(
    `${acquisitionDate}T${acquisitionTime.slice(0, 2)}:${acquisitionTime.slice(2)}:00Z`,
  );
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseServerFire(value: unknown): FirePoint | null {
  if (!isRecord(value)) return null;
  const latitude = optionalFiniteNumber(value.lat);
  const longitude = optionalFiniteNumber(value.lon);
  const acquisitionDate = optionalString(value.acqDate);
  const acquisitionTime = optionalString(value.acqTime);
  if (
    latitude === undefined ||
    longitude === undefined ||
    (latitude === 0 && longitude === 0) ||
    !acquisitionDate ||
    !acquisitionTime
  ) {
    return null;
  }
  const coordinate = createGeoPoint(longitude, latitude);
  const timestamp = acquisitionTimestamp(acquisitionDate, acquisitionTime);
  if (!coordinate || !timestamp) return null;
  const satellite =
    optionalString(value.satellite) ??
    FireIdentityToken.UnknownSatellite;
  const id = [
    FireIdentityToken.Prefix,
    satellite,
    acquisitionDate.replaceAll("-", FireIdentityToken.Empty),
    acquisitionTime,
    coordinate[1].toFixed(4),
    coordinate[0].toFixed(4),
  ].join(FireIdentityToken.Separator);
  return {
    id,
    type: Domain.Fires,
    lat: coordinate[1],
    lon: coordinate[0],
    timestamp,
    data: {
      brightness: optionalFiniteNumber(value.brightness),
      frp: optionalFiniteNumber(value.frp),
      confidence: optionalString(value.confidence),
      satellite,
      instrument: optionalString(value.instrument),
      scan: optionalFiniteNumber(value.scan),
      track: optionalFiniteNumber(value.track),
      brightT31: optionalFiniteNumber(value.brightT31),
      daynight: optionalString(value.daynight),
      acqDate: acquisitionDate,
      acqTime: acquisitionTime,
      complexSize: optionalFiniteNumber(value.complexSize),
      complexFrp: optionalFiniteNumber(value.complexFrp),
    },
  };
}

export function parseFireFeed(value: unknown): FirePoint[] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new FireFetchError(FireFeedErrorKind.InvalidResponse);
  }
  const byIdentity = new Map<string, FirePoint>();
  for (const candidate of value.data) {
    const point = parseServerFire(candidate);
    if (point) byIdentity.set(point.id, point);
  }
  return [...byIdentity.values()];
}

export async function fetchFires(): Promise<FirePoint[]> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    FIRE_FEED_POLICY.requestTimeoutMs,
  );
  try {
    const response = await authenticatedFetch(FIRE_FEED_POLICY.feedUrl, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw fireFetchError(response.status);
    }
    const payload: unknown = await response.json();
    return parseFireFeed(payload);
  } finally {
    clearTimeout(timeout);
  }
}
