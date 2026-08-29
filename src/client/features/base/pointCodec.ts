import type { DataPoint, DataType } from "@/features/base/dataPoints";
import type { BasePoint } from "@/features/base/types";
import { createGeoPoint, isRecord } from "@shared/geo";

export function isOptionalString(value: unknown): value is string {
  return typeof value === "string";
}

export function isOptionalBoolean(value: unknown): boolean {
  return typeof value === "boolean";
}

/** The fields every DataPoint carries, whatever its type. */
export function hasPointShape<TType extends DataType>(
  value: unknown,
  type: TType,
): value is Readonly<Record<string, unknown>> & BasePoint & { type: TType } {
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

/** A cached point, re-normalized through its data parser. */
export function parseDataPoint<TType extends DataType, TData>(
  value: unknown,
  type: TType,
  parseData: (value: unknown) => TData | null,
): (BasePoint & { type: TType; data: TData }) | null {
  if (!hasPointShape(value, type)) return null;
  const coordinate = createGeoPoint(value.lon, value.lat);
  const data = parseData(value.data);
  if (!coordinate || !data) return null;
  return {
    id: value.id,
    type,
    lat: coordinate[1],
    lon: coordinate[0],
    ...(value.timestamp ? { timestamp: value.timestamp } : {}),
    data,
  };
}

/** All-or-nothing: a single bad record rejects the batch. */
export function parsePoints<TPoint>(
  value: unknown,
  parse: (candidate: unknown) => TPoint | null,
): TPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points: TPoint[] = [];
  for (const candidate of value) {
    const point = parse(candidate);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

export function parsePointList<TPoint extends DataPoint>(
  value: unknown,
  isPoint: (candidate: unknown) => candidate is TPoint,
): TPoint[] | null {
  return parsePoints(value, (candidate) =>
    isPoint(candidate) ? candidate : null,
  );
}
