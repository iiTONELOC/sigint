import type { DataPoint } from "@/features/base/dataPoints";
import { isRecord } from "@shared/geo";

/**
 * Optional payload fields are absent far more often than present, so a codec
 * checks the shape of what is there rather than requiring every key.
 */
export function hasOptionalFields(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  matches: (candidate: unknown) => boolean,
): boolean {
  return keys.every((key) => {
    const candidate = value[key];
    return candidate === undefined || matches(candidate);
  });
}

export function isOptionalString(value: unknown): boolean {
  return typeof value === "string";
}

export function isOptionalNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

export function isOptionalBoolean(value: unknown): boolean {
  return typeof value === "boolean";
}

/** The fields every DataPoint carries, whatever its type. */
export function hasPointShape(
  value: unknown,
  type: DataPoint["type"],
): value is Readonly<Record<string, unknown>> {
  return (
    isRecord(value) &&
    value.type === type &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value.lon === "number" &&
    Number.isFinite(value.lon) &&
    (value.timestamp === undefined || typeof value.timestamp === "string")
  );
}

/** All-or-nothing: a single bad record rejects the batch. */
export function parsePointList<TPoint extends DataPoint>(
  value: unknown,
  isPoint: (candidate: unknown) => candidate is TPoint,
): TPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points: TPoint[] = [];
  for (const candidate of value) {
    if (!isPoint(candidate)) return null;
    points.push(candidate);
  }
  return points;
}
