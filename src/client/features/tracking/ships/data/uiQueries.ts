import { isShipPoint, type ShipPoint } from "@/features/tracking/ships/data/codec";
import {
  findPointSearchIds,
  parsePointUiQuery,
  parsePointUiQueryResult,
  runPointUiQuery,
  type PointUiQuery,
  type PointUiQueryDescriptor,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";

export type ShipUiQuery = PointUiQuery;
export type ShipUiQueryResult = PointUiQueryResult<ShipPoint>;

function parseShipEntity(value: unknown): ShipPoint | null {
  return isShipPoint(value) ? value : null;
}

function vesselName(point: ShipPoint): string {
  return point.data.name || point.id;
}

function speedKnots(point: ShipPoint): number {
  return point.data.sog ?? point.data.speed ?? 0;
}

export const SHIP_UI_QUERY: PointUiQueryDescriptor<ShipPoint> = {
  parseEntity: parseShipEntity,
  searchText: (point) =>
    [
      point.data.name,
      point.data.callSign,
      point.data.vesselType,
      point.data.flag,
      point.data.destination,
    ]
      .filter((segment): segment is string => Boolean(segment))
      .join(" "),
  primaryLabel: vesselName,
  nameLabel: vesselName,
  value1: speedKnots,
  value1Label: (point) => point.data.vesselType ?? "",
  value2: (point) => point.data.length ?? 0,
  includeInTable: (point, minValue) => speedKnots(point) >= minValue,
  supportsCorrelation: false,
};

export function parseShipUiQuery(value: unknown): ShipUiQuery | null {
  return parsePointUiQuery(value, SHIP_UI_QUERY.supportsCorrelation);
}

export function parseShipUiQueryResult(
  value: unknown,
): ShipUiQueryResult | null {
  return parsePointUiQueryResult(value, SHIP_UI_QUERY.parseEntity);
}

export function findShipSearchIds(
  points: readonly ShipPoint[],
  text: string,
): string[] {
  return findPointSearchIds(points, text, SHIP_UI_QUERY);
}

export function runShipUiQuery(
  points: readonly ShipPoint[],
  query: ShipUiQuery,
  now: number = Date.now(),
): ShipUiQueryResult {
  return runPointUiQuery(points, query, SHIP_UI_QUERY, now);
}
