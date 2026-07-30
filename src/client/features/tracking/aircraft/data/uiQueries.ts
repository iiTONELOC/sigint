import {
  isAircraftPoint,
  type AircraftPoint,
} from "@/features/tracking/aircraft/data/codec";
import {
  getSquawkStatus,
  isAircraftFilter,
  matchesAircraftFilter,
} from "@/features/tracking/aircraft/lib/utils";
import {
  createPointUiQueries,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";

export type AircraftUiQuery = PointUiQuery;
export type AircraftUiQueryResult = PointUiQueryResult<AircraftPoint>;

function callsign(point: AircraftPoint): string {
  return point.data.callsign?.trim() || point.id;
}

/** A squawk the controller escalated: it leads the ticker whatever else is
 *  newer, and it stays in the feed even while the aircraft is on the ground. */
function isSquawkingEmergency(point: AircraftPoint): boolean {
  return getSquawkStatus(point.data.squawk) !== "normal";
}

export const AIRCRAFT_UI_QUERIES = createPointUiQueries<AircraftPoint>({
  parseEntity: (value) => (isAircraftPoint(value) ? value : null),
  searchText: (point) =>
    [
      point.data.callsign,
      point.data.registration,
      point.data.icao24,
      point.data.operator,
      point.data.model,
      point.data.originCountry,
    ]
      .filter((segment): segment is string => Boolean(segment))
      .join(" "),
  primaryLabel: callsign,
  nameLabel: (point) => point.data.operator ?? callsign(point),
  value1: (point) => point.data.altitude ?? 0,
  value1Label: (point) => point.data.model ?? "",
  value2: (point) => point.data.speed ?? 0,
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
