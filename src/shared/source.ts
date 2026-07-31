import { isRecord } from "./geo";
import { Domain } from "./domain/identity";
import { isEnumValue } from "./types/enum";

export type SourceId =
  | Domain.Aircraft
  | Domain.Ships
  | Domain.Events
  | Domain.Weather
  | Domain.Cyclones
  | Domain.CycloneWarnings
  | Domain.Earthquake
  | Domain.Fire
  | Domain.News;

export const SOURCE_IDS: readonly SourceId[] = [
  Domain.Aircraft,
  Domain.Ships,
  Domain.Events,
  Domain.Weather,
  Domain.Cyclones,
  Domain.CycloneWarnings,
  Domain.Earthquake,
  Domain.Fire,
  Domain.News,
];

const SOURCE_ID_VALUES: ReadonlySet<string> = new Set(SOURCE_IDS);

export function isSourceIdValue(value: unknown): value is SourceId {
  return typeof value === "string" && SOURCE_ID_VALUES.has(value);
}

export enum SourcePhase {
  Cold = "cold",
  Loading = "loading",
  Ready = "ready",
  Degraded = "degraded",
  Unavailable = "unavailable",
}

export enum SourceFreshness {
  Fresh = "fresh",
  Stale = "stale",
  Expired = "expired",
}

export enum SourceCompleteness {
  Complete = "complete",
  Partial = "partial",
  Unknown = "unknown",
}

export enum SourceErrorCode {
  RateLimited = "rate_limited",
  HttpError = "http_error",
  NetworkError = "network_error",
  InvalidPayload = "invalid_payload",
  FixtureError = "fixture_error",
  EmptyResult = "empty_result",
}

export type SourceError = Readonly<{
  code: SourceErrorCode;
  message: string;
}>;

export type SourceState = Readonly<{
  source: SourceId;
  phase: SourcePhase;
  freshness: SourceFreshness;
  completeness: SourceCompleteness;
  sequence: number;
  observedAt: number | null;
  receivedAt: number | null;
  expiresAt: number | null;
  successfulScopes: number;
  failedScopes: number;
  totalScopes: number;
  error: SourceError | null;
}>;

export type SourceEnvelope<T> = Readonly<{
  source: SourceState;
  data: readonly T[];
}>;

function isTimestamp(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isCount(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function parseSourceError(value: unknown): SourceError | null | false {
  if (value === null) return null;
  if (!isRecord(value)) return false;
  if (!isEnumValue(value.code, SourceErrorCode)) return false;
  if (typeof value.message !== "string") return false;
  return { code: value.code, message: value.message };
}

export function parseSourceState(value: unknown): SourceState | null {
  if (!isRecord(value)) return null;
  if (!isSourceIdValue(value.source)) return null;
  if (!isEnumValue(value.phase, SourcePhase)) return null;
  if (!isEnumValue(value.freshness, SourceFreshness)) return null;
  if (!isEnumValue(value.completeness, SourceCompleteness)) return null;
  if (!isCount(value.sequence)) return null;
  if (!isTimestamp(value.observedAt)) return null;
  if (!isTimestamp(value.receivedAt)) return null;
  if (!isTimestamp(value.expiresAt)) return null;
  if (!isCount(value.successfulScopes)) return null;
  if (!isCount(value.failedScopes)) return null;
  if (!isCount(value.totalScopes)) return null;

  const error = parseSourceError(value.error);
  if (error === false) return null;

  return {
    source: value.source,
    phase: value.phase,
    freshness: value.freshness,
    completeness: value.completeness,
    sequence: value.sequence,
    observedAt: value.observedAt,
    receivedAt: value.receivedAt,
    expiresAt: value.expiresAt,
    successfulScopes: value.successfulScopes,
    failedScopes: value.failedScopes,
    totalScopes: value.totalScopes,
    error,
  };
}
