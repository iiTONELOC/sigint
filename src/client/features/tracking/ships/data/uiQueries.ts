import { isShipPoint } from "@/features/tracking/ships/data/codec";
import type { ShipPoint } from "@shared/domain/ships";
import { shipPresentation } from "../formatters/presentation";
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

export const SHIP_UI_QUERIES = createPointUiQueries<ShipPoint>({
  parseEntity: (value) => (isShipPoint(value) ? value : null),
  searchText: (point) => shipPresentation(point.data, point.id).searchText,
  primaryLabel: (point) => shipPresentation(point.data, point.id).name,
  nameLabel: (point) => shipPresentation(point.data, point.id).name,
  value1: (point) => shipPresentation(point.data, point.id).classificationRank,
  value1Label: (point) => shipPresentation(point.data, point.id).classification,
  value2: (point) => shipPresentation(point.data, point.id).detailRank,
  includeInTable: (point, minValue) =>
    shipPresentation(point.data, point.id).detailRank >= minValue,
  // Ships have no threshold control; the layer switch is the whole filter.
  matchesFilter: (_point, filter) => filter === true,
  includeInTicker: (point) =>
    shipPresentation(point.data, point.id).detailRank >= MINIMUM_MOVING_SPEED_KNOTS,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: false,
});
