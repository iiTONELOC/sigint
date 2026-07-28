import { isShipPoint, type ShipPoint } from "@/features/tracking/ships/data/codec";
import {
  createPointUiQueries,
  neverTickerPriority,
  noFilterFacet,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";

export type ShipUiQuery = PointUiQuery;
export type ShipUiQueryResult = PointUiQueryResult<ShipPoint>;

/** Below this a vessel is moored or drifting, not traffic worth reporting. */
const MINIMUM_MOVING_SPEED_KNOTS = 0.5;

function vesselName(point: ShipPoint): string {
  return point.data.name || point.id;
}

function speedKnots(point: ShipPoint): number {
  return point.data.sog ?? point.data.speed ?? 0;
}

export const SHIP_UI_QUERIES = createPointUiQueries<ShipPoint>({
  parseEntity: (value) => (isShipPoint(value) ? value : null),
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
  // Ships have no threshold control; the layer switch is the whole filter.
  matchesFilter: (_point, filter) => filter === true,
  includeInTicker: (point) => speedKnots(point) >= MINIMUM_MOVING_SPEED_KNOTS,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: false,
});
