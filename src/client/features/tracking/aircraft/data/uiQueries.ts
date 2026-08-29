import {
  isAircraftPoint,
} from "@/features/tracking/aircraft/data/codec";
import {
  isAircraftFilter,
  matchesAircraftFilter,
} from "@shared/domain/aircraftFilter";
import { squawkStatusFor, SquawkStatus, type AircraftPoint } from "@shared/domain/aircraft";
import { createPointUiQueries } from "@/workers/data/uiQuery";
import {
  aircraftSearchText,
  aircraftTablePresentation,
} from "../formatters/presentation";

/** A squawk the controller escalated: it leads the ticker whatever else is
 *  newer, and it stays in the feed even while the aircraft is on the ground. */
function isSquawkingEmergency(point: AircraftPoint): boolean {
  return squawkStatusFor(point.data.squawk) !== SquawkStatus.Normal;
}

export const AIRCRAFT_UI_QUERIES = createPointUiQueries<AircraftPoint>({
  parseEntity: (value) => (isAircraftPoint(value) ? value : null),
  searchText: (point) => aircraftSearchText(point.data),
  primaryLabel: (point) =>
    aircraftTablePresentation(point.data, point.id).name,
  nameLabel: (point) =>
    aircraftTablePresentation(point.data, point.id).name,
  value1: (point) =>
    aircraftTablePresentation(point.data, point.id).classificationRank,
  value1Label: (point) =>
    aircraftTablePresentation(point.data, point.id).classification,
  value2: (point) =>
    aircraftTablePresentation(point.data, point.id).detailRank,
  includeInTable: (point, minValue) =>
    (point.data.altitude ?? 0) >= minValue,
  matchesFilter: (point, filter) =>
    isAircraftFilter(filter) && matchesAircraftFilter(point, filter),
  includeInTicker: (point) =>
    isSquawkingEmergency(point) || point.data.onGround !== true,
  tickerPriority: isSquawkingEmergency,
  filterFacet: (point) => point.data.originCountry ?? null,
  supportsCorrelation: false,
});
