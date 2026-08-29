import {
  isEventPoint,
  type EventPoint,
} from "@/features/intel/events/data/codec";
import {
  alwaysInTicker,
  createPointUiQueries,
  neverTickerPriority,
  noFilterFacet,
} from "@/workers/data/uiQuery";
import type { EventData } from "@shared/domain/events";
import { joinSearchText } from "@shared/text";
import { eventTablePresentation } from "../formatters/presentation";

export function eventSearchText(data: EventData): string {
  return joinSearchText([
    data.headline,
    data.category,
    data.locationName,
    data.sourceCountry,
    data.actor1,
    data.actor2,
    data.source,
  ]);
}

function tablePresentation(point: EventPoint) {
  return eventTablePresentation(point.data, point.id);
}

export const EVENT_UI_QUERIES = createPointUiQueries<EventPoint>({
  parseEntity: (value) => (isEventPoint(value) ? value : null),
  searchText: (point) => eventSearchText(point.data),
  primaryLabel: (point) => tablePresentation(point).name,
  nameLabel: (point) => tablePresentation(point).name,
  value1: (point) => tablePresentation(point).classificationRank,
  value1Label: (point) => tablePresentation(point).classification,
  value2: (point) => tablePresentation(point).detailRank,
  includeInTable: (point, minValue) =>
    tablePresentation(point).classificationRank >= minValue,
  matchesFilter: (_point, filter) => filter === true,
  includeInTicker: alwaysInTicker,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: true,
});
