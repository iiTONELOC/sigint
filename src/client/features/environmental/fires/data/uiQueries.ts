import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import {
  fireConfidenceLevel,
  parseFirePoint,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import { isRecord } from "@shared/geo";

export type FireTableSortKey =
  | "type"
  | "name"
  | "lat"
  | "lon"
  | "value1"
  | "value2"
  | "age";

export type FireTableSortDirection = "asc" | "desc";

export type FireUiQuery =
  | Readonly<{ kind: "search"; text: string }>
  | Readonly<{
      kind: "table";
      minConfidence: number;
      sortKey: FireTableSortKey;
      sortDirection: FireTableSortDirection;
      offset: number;
      limit: number;
    }>
  | Readonly<{ kind: "ticker"; limit: number }>;

export type FireSearchQueryResult = Readonly<{
  kind: "search";
  total: number;
  items: readonly FirePoint[];
}>;

export type FireTableQueryResult = Readonly<{
  kind: "table";
  total: number;
  items: readonly FirePoint[];
}>;

export type FireTickerQueryResult = Readonly<{
  kind: "ticker";
  items: readonly FirePoint[];
}>;

export type FireUiQueryResult =
  | FireSearchQueryResult
  | FireTableQueryResult
  | FireTickerQueryResult;

function isSortKey(value: unknown): value is FireTableSortKey {
  return (
    value === "type" ||
    value === "name" ||
    value === "lat" ||
    value === "lon" ||
    value === "value1" ||
    value === "value2" ||
    value === "age"
  );
}

function isSortDirection(
  value: unknown,
): value is FireTableSortDirection {
  return value === "asc" || value === "desc";
}

export function parseFireUiQuery(value: unknown): FireUiQuery | null {
  if (!isRecord(value)) return null;
  if (
    value.kind === "search" &&
    typeof value.text === "string" &&
    value.text.trim().length > 0
  ) {
    return { kind: "search", text: value.text };
  }
  if (
    value.kind === "table" &&
    typeof value.minConfidence === "number" &&
    Number.isSafeInteger(value.minConfidence) &&
    value.minConfidence >= 0 &&
    value.minConfidence <= 2 &&
    isSortKey(value.sortKey) &&
    isSortDirection(value.sortDirection) &&
    typeof value.offset === "number" &&
    Number.isSafeInteger(value.offset) &&
    value.offset >= 0 &&
    typeof value.limit === "number" &&
    Number.isSafeInteger(value.limit) &&
    value.limit > 0
  ) {
    return {
      kind: "table",
      minConfidence: value.minConfidence,
      sortKey: value.sortKey,
      sortDirection: value.sortDirection,
      offset: value.offset,
      limit: value.limit,
    };
  }
  if (
    value.kind === "ticker" &&
    typeof value.limit === "number" &&
    Number.isSafeInteger(value.limit) &&
    value.limit > 0
  ) {
    return { kind: "ticker", limit: value.limit };
  }
  return null;
}

function parsePoints(value: unknown): FirePoint[] | null {
  if (!Array.isArray(value)) return null;
  const points: FirePoint[] = [];
  for (const candidate of value) {
    const point = parseFirePoint(candidate);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

export function parseFireUiQueryResult(
  value: unknown,
): FireUiQueryResult | null {
  if (!isRecord(value)) return null;
  const items = parsePoints(value.items);
  if (!items) return null;
  if (
    (value.kind === "search" || value.kind === "table") &&
    typeof value.total === "number" &&
    Number.isSafeInteger(value.total) &&
    value.total >= 0
  ) {
    return { kind: value.kind, total: value.total, items };
  }
  if (value.kind === "ticker") return { kind: "ticker", items };
  return null;
}

function getSearchText(point: FirePoint): string {
  const data = point.data;
  return [
    data.satellite,
    data.confidence,
    data.frp !== undefined ? `FRP${data.frp}` : "",
    data.daynight === "D"
      ? "day"
      : data.daynight === "N"
        ? "night"
        : "",
  ]
    .filter((segment): segment is string => Boolean(segment))
    .join(" ");
}

function scoreSearchMatch(
  query: string,
  searchText: string,
  primary: string,
): number {
  const normalizedQuery = query.toLowerCase();
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const normalizedText = searchText.toLowerCase();
  const normalizedPrimary = primary.toLowerCase();
  for (const word of words) {
    if (!normalizedText.includes(word)) return 0;
  }
  if (normalizedPrimary === normalizedQuery) return 100;
  let score = normalizedPrimary.startsWith(normalizedQuery) ? 51 : 1;
  for (const word of words) {
    if (normalizedPrimary === word) score += 30;
    else if (normalizedPrimary.startsWith(word)) score += 15;
  }
  for (const word of words) {
    const index = normalizedText.indexOf(word);
    if (index >= 0) score += Math.max(0, 10 - index * 0.5);
  }
  return score;
}

type FireSearchMatch = Readonly<{
  point: FirePoint;
  score: number;
}>;

function searchMatches(
  points: readonly FirePoint[],
  text: string,
): FireSearchMatch[] {
  const matches: FireSearchMatch[] = [];
  for (const point of points) {
    const score = scoreSearchMatch(text, getSearchText(point), point.id);
    if (score > 0) matches.push({ point, score });
  }
  matches.sort((left, right) => right.score - left.score);
  return matches;
}

export function findFireSearchIds(
  points: readonly FirePoint[],
  text: string,
): string[] {
  return searchMatches(points, text).map((match) => match.point.id);
}

function search(
  points: readonly FirePoint[],
  text: string,
): FireSearchQueryResult {
  const matches = searchMatches(points, text);
  return {
    kind: "search",
    total: matches.length,
    items: matches
      .slice(0, POINT_UI_QUERY_POLICY.searchResultLimit)
      .map((match) => match.point),
  };
}

function age(point: FirePoint, now: number): number {
  if (!point.timestamp) return 0;
  return now - Date.parse(point.timestamp);
}

function confidenceLabel(point: FirePoint): string {
  return point.data.confidence?.toUpperCase() ?? "";
}

function compare(
  left: FirePoint,
  right: FirePoint,
  sortKey: FireTableSortKey,
  now: number,
): number {
  if (sortKey === "type") return 0;
  if (sortKey === "name") {
    const leftName =
      left.data.frp !== undefined
        ? `FRP ${left.data.frp.toFixed(1)} MW`
        : "Fire hotspot";
    const rightName =
      right.data.frp !== undefined
        ? `FRP ${right.data.frp.toFixed(1)} MW`
        : "Fire hotspot";
    return leftName.localeCompare(rightName);
  }
  if (sortKey === "lat") return left.lat - right.lat;
  if (sortKey === "lon") return left.lon - right.lon;
  if (sortKey === "value1") {
    return (
      (left.data.frp ?? 0) - (right.data.frp ?? 0) ||
      confidenceLabel(left).localeCompare(confidenceLabel(right))
    );
  }
  if (sortKey === "value2") {
    return (left.data.brightness ?? 0) - (right.data.brightness ?? 0);
  }
  return age(left, now) - age(right, now);
}

function table(
  points: readonly FirePoint[],
  query: Extract<FireUiQuery, { kind: "table" }>,
  now: number,
): FireTableQueryResult {
  const filtered = points.filter(
    (point) =>
      fireConfidenceLevel(point.data.confidence) >= query.minConfidence,
  );
  const direction = query.sortDirection === "asc" ? 1 : -1;
  filtered.sort(
    (left, right) =>
      compare(left, right, query.sortKey, now) * direction,
  );
  return {
    kind: "table",
    total: filtered.length,
    items: filtered.slice(query.offset, query.offset + query.limit),
  };
}

function sortableTimestamp(point: FirePoint): number {
  if (!point.timestamp) return 0;
  const timestamp = Date.parse(point.timestamp);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function runFireUiQuery(
  points: readonly FirePoint[],
  query: FireUiQuery,
  now: number = Date.now(),
): FireUiQueryResult {
  if (query.kind === "search") return search(points, query.text);
  if (query.kind === "table") return table(points, query, now);
  return {
    kind: "ticker",
    items: [...points]
      .sort(
        (left, right) =>
          sortableTimestamp(right) - sortableTimestamp(left),
      )
      .slice(0, query.limit),
  };
}
