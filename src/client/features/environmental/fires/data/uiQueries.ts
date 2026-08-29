import {
  parseFirePoint,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import {
  alwaysInTicker,
  createPointUiQueries,
  neverTickerPriority,
  noFilterFacet,
} from "@/workers/data/uiQuery";
import { fireQueryTableName, fireQuerySearchText } from "../formatters/presentation";

export const FIRE_UI_QUERIES = createPointUiQueries<FirePoint>({
  parseEntity: parseFirePoint,
  searchText: (point) => fireQuerySearchText(point.data),
  primaryLabel: (point) => point.id,
  nameLabel: (point) => fireQueryTableName(point.data),
  value1: (point) => point.data.frp ?? 0,
  value1Label: (point) => point.data.confidence?.toUpperCase() ?? "",
  value2: (point) => point.data.brightness ?? 0,
  includeInTable: () => true,
  matchesFilter: (_point, filter) => filter === true,
  includeInTicker: alwaysInTicker,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: false,
});
