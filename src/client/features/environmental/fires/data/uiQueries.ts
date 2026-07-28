import {
  fireConfidenceLevel,
  parseFirePoint,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import {
  findPointSearchIds,
  parsePointUiQuery,
  parsePointUiQueryResult,
  runPointUiQuery,
  type PointUiQuery,
  type PointUiQueryDescriptor,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";

export type { TableSortDirection, TableSortKey } from "@/workers/data/uiQuery";

export type FireUiQuery = PointUiQuery;
export type FireUiQueryResult = PointUiQueryResult<FirePoint>;

const DAY_NIGHT_LABELS = { D: "day", N: "night" } as const;

function radiativePowerLabel(point: FirePoint): string {
  return point.data.frp === undefined ? "" : `FRP${point.data.frp}`;
}

function hotspotName(point: FirePoint): string {
  return point.data.frp === undefined
    ? "Fire hotspot"
    : `FRP ${point.data.frp.toFixed(1)} MW`;
}

function dayNightLabel(point: FirePoint): string {
  const value = point.data.daynight;
  if (value === "D") return DAY_NIGHT_LABELS.D;
  if (value === "N") return DAY_NIGHT_LABELS.N;
  return "";
}

export const FIRE_UI_QUERY: PointUiQueryDescriptor<FirePoint> = {
  parseEntity: parseFirePoint,
  searchText: (point) =>
    [
      point.data.confidence,
      point.data.satellite,
      radiativePowerLabel(point),
      dayNightLabel(point),
    ]
      .filter((segment): segment is string => Boolean(segment))
      .join(" "),
  primaryLabel: (point) => point.id,
  nameLabel: hotspotName,
  value1: (point) => point.data.frp ?? 0,
  value1Label: (point) => point.data.confidence?.toUpperCase() ?? "",
  value2: (point) => point.data.brightness ?? 0,
  includeInTable: (point, minValue) =>
    fireConfidenceLevel(point.data.confidence) >= minValue,
  supportsCorrelation: false,
};

export function parseFireUiQuery(value: unknown): FireUiQuery | null {
  return parsePointUiQuery(value, FIRE_UI_QUERY.supportsCorrelation);
}

export function parseFireUiQueryResult(
  value: unknown,
): FireUiQueryResult | null {
  return parsePointUiQueryResult(value, FIRE_UI_QUERY.parseEntity);
}

export function findFireSearchIds(
  points: readonly FirePoint[],
  text: string,
): string[] {
  return findPointSearchIds(points, text, FIRE_UI_QUERY);
}

export function runFireUiQuery(
  points: readonly FirePoint[],
  query: FireUiQuery,
  now: number = Date.now(),
): FireUiQueryResult {
  return runPointUiQuery(points, query, FIRE_UI_QUERY, now);
}
