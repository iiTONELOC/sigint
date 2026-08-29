import {
  parseEarthquakePoint,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import {
  alwaysInTicker,
  createPointUiQueries,
  neverTickerPriority,
  noFilterFacet,
} from "@/workers/data/uiQuery";
import type { EarthquakeData } from "@shared/domain/earthquakes";
import { joinSearchText } from "@shared/text";
import { earthquakeTablePresentation } from "../formatters/presentation";

export function earthquakeSearchText(data: EarthquakeData): string {
  return joinSearchText([
    data.location,
    data.magnitude === undefined ? "" : `M${data.magnitude}`,
    data.alert,
    data.eventType,
  ]);
}

function tablePresentation(point: EarthquakePoint) {
  return earthquakeTablePresentation(point.data, point.id);
}

export const EARTHQUAKE_UI_QUERIES = createPointUiQueries<EarthquakePoint>({
  parseEntity: parseEarthquakePoint,
  searchText: (point) => earthquakeSearchText(point.data),
  primaryLabel: (point) => tablePresentation(point).name,
  nameLabel: (point) => tablePresentation(point).name,
  value1: (point) => tablePresentation(point).classificationRank,
  value1Label: (point) => tablePresentation(point).classification,
  value2: (point) => tablePresentation(point).detailRank,
  includeInTable: () => true,
  matchesFilter: (_point, filter) => filter === true,
  includeInTicker: alwaysInTicker,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: true,
});
