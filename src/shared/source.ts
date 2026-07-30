import { isRecord } from "./geo";

export const SOURCE_IDS = [
  "aircraft",
  "ships",
  "quakes",
  "events",
  "fires",
  "weather",
  "cyclones",
  "news",
] as const;

export const SOURCE_PHASES = [
  "cold",
  "loading",
  "ready",
  "degraded",
  "unavailable",
] as const;

export const SOURCE_FRESHNESS = ["fresh", "stale", "expired"] as const;

export const SOURCE_COMPLETENESS = [
  "complete",
  "partial",
  "unknown",
] as const;

export const SOURCE_ERROR_CODES = [
  "rate_limited",
  "http_error",
  "network_error",
  "invalid_payload",
  "fixture_error",
  "empty_result",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];
export type SourcePhase = (typeof SOURCE_PHASES)[number];
export type SourceFreshness = (typeof SOURCE_FRESHNESS)[number];
export type SourceCompleteness = (typeof SOURCE_COMPLETENESS)[number];
export type SourceErrorCode = (typeof SOURCE_ERROR_CODES)[number];

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

function isMember<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return (
    typeof value === "string" &&
    values.some((candidate) => candidate === value)
  );
}

function isTimestamp(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function parseSourceState(value: unknown): SourceState | null {
  if (!isRecord(value)) return null;
  if (!isMember(value.source, SOURCE_IDS)) return null;
  if (!isMember(value.phase, SOURCE_PHASES)) return null;
  if (!isMember(value.freshness, SOURCE_FRESHNESS)) return null;
  if (!isMember(value.completeness, SOURCE_COMPLETENESS)) return null;
  if (!isCount(value.sequence)) return null;
  if (!isTimestamp(value.observedAt)) return null;
  if (!isTimestamp(value.receivedAt)) return null;
  if (!isTimestamp(value.expiresAt)) return null;
  if (!isCount(value.successfulScopes)) return null;
  if (!isCount(value.failedScopes)) return null;
  if (!isCount(value.totalScopes)) return null;

  let error: SourceError | null = null;
  if (value.error !== null) {
    if (!isRecord(value.error)) return null;
    if (!isMember(value.error.code, SOURCE_ERROR_CODES)) return null;
    if (typeof value.error.message !== "string") return null;
    error = {
      code: value.error.code,
      message: value.error.message,
    };
  }

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
