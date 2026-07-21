import {
  parseEarthquakePoint,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import { isRecord } from "@shared/geo";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";

export type EarthquakeTableSortKey =
  | "type"
  | "name"
  | "lat"
  | "lon"
  | "value1"
  | "value2"
  | "age";

export type EarthquakeTableSortDirection = "asc" | "desc";

export type EarthquakeUiQuery =
  | Readonly<{
      kind: "search";
      text: string;
    }>
  | Readonly<{
      kind: "table";
      minMagnitude: number;
      sortKey: EarthquakeTableSortKey;
      sortDirection: EarthquakeTableSortDirection;
      offset: number;
      limit: number;
    }>
  | Readonly<{
      kind: "ticker";
      limit: number;
    }>
  | Readonly<{
      kind: "correlation";
      since: number;
    }>;

export type EarthquakeSearchQueryResult = Readonly<{
  kind: "search";
  total: number;
  items: readonly EarthquakePoint[];
}>;

export type EarthquakeTableQueryResult = Readonly<{
  kind: "table";
  total: number;
  items: readonly EarthquakePoint[];
}>;

export type EarthquakeTickerQueryResult = Readonly<{
  kind: "ticker";
  items: readonly EarthquakePoint[];
}>;

export type EarthquakeCorrelationQueryResult = Readonly<{
  kind: "correlation";
  items: readonly EarthquakePoint[];
}>;

export type EarthquakeUiQueryResult =
  | EarthquakeSearchQueryResult
  | EarthquakeTableQueryResult
  | EarthquakeTickerQueryResult
  | EarthquakeCorrelationQueryResult;

export type EarthquakeUiQueryPolicy = Readonly<{
  searchResultLimit: number;
}>;

export const EARTHQUAKE_UI_QUERY_POLICY: EarthquakeUiQueryPolicy =
  POINT_UI_QUERY_POLICY;

function isTableSortKey(value: unknown): value is EarthquakeTableSortKey {
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

function isTableSortDirection(
  value: unknown,
): value is EarthquakeTableSortDirection {
  return value === "asc" || value === "desc";
}

export function parseEarthquakeUiQuery(
  value: unknown,
): EarthquakeUiQuery | null {
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
    typeof value.minMagnitude === "number" &&
    Number.isFinite(value.minMagnitude) &&
    value.minMagnitude >= 0 &&
    isTableSortKey(value.sortKey) &&
    isTableSortDirection(value.sortDirection) &&
    typeof value.offset === "number" &&
    Number.isSafeInteger(value.offset) &&
    value.offset >= 0 &&
    typeof value.limit === "number" &&
    Number.isSafeInteger(value.limit) &&
    value.limit > 0
  ) {
    return {
      kind: "table",
      minMagnitude: value.minMagnitude,
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
  if (
    value.kind === "correlation" &&
    typeof value.since === "number" &&
    Number.isFinite(value.since) &&
    value.since >= 0
  ) {
    return { kind: "correlation", since: value.since };
  }
  return null;
}

function parsePoints(value: unknown): EarthquakePoint[] | null {
  if (!Array.isArray(value)) return null;
  const points: EarthquakePoint[] = [];
  for (const candidate of value) {
    const point = parseEarthquakePoint(candidate);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

export function parseEarthquakeUiQueryResult(
  value: unknown,
): EarthquakeUiQueryResult | null {
  if (!isRecord(value)) return null;
  const items = parsePoints(value.items);
  if (!items) return null;
  if (
    value.kind === "search" &&
    typeof value.total === "number" &&
    Number.isSafeInteger(value.total) &&
    value.total >= 0
  ) {
    return { kind: "search", total: value.total, items };
  }
  if (
    value.kind === "table" &&
    typeof value.total === "number" &&
    Number.isSafeInteger(value.total) &&
    value.total >= 0
  ) {
    return { kind: "table", total: value.total, items };
  }
  if (value.kind === "ticker") return { kind: "ticker", items };
  if (value.kind === "correlation") {
    return { kind: "correlation", items };
  }
  return null;
}

function getSearchText(point: EarthquakePoint): string {
  const segments: string[] = [];
  if (point.data.location) segments.push(point.data.location);
  if (point.data.magnitude !== undefined) {
    segments.push(`M${point.data.magnitude}`);
  }
  if (point.data.alert) segments.push(point.data.alert);
  if (point.data.eventType) segments.push(point.data.eventType);
  return segments.join(" ");
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

type EarthquakeSearchMatch = Readonly<{
  point: EarthquakePoint;
  score: number;
}>;

function earthquakeSearchMatches(
  points: readonly EarthquakePoint[],
  text: string,
): EarthquakeSearchMatch[] {
  const matches: EarthquakeSearchMatch[] = [];
  for (const point of points) {
    const primary = point.data.location || point.id;
    const score = scoreSearchMatch(text, getSearchText(point), primary);
    if (score > 0) matches.push({ point, score });
  }
  matches.sort((left, right) => right.score - left.score);
  return matches;
}

export function findEarthquakeSearchIds(
  points: readonly EarthquakePoint[],
  text: string,
): string[] {
  return earthquakeSearchMatches(points, text).map(
    (match) => match.point.id,
  );
}

function search(
  points: readonly EarthquakePoint[],
  text: string,
): EarthquakeSearchQueryResult {
  const matches = earthquakeSearchMatches(points, text);
  return {
    kind: "search",
    total: matches.length,
    items: matches
      .slice(0, EARTHQUAKE_UI_QUERY_POLICY.searchResultLimit)
      .map((match) => match.point),
  };
}

function getAge(point: EarthquakePoint, now: number): number {
  if (!point.timestamp) return 0;
  return now - new Date(point.timestamp).getTime();
}

function compareTablePoints(
  left: EarthquakePoint,
  right: EarthquakePoint,
  sortKey: EarthquakeTableSortKey,
  now: number,
): number {
  if (sortKey === "type") return 0;
  if (sortKey === "name") {
    return (left.data.location || left.id).localeCompare(
      right.data.location || right.id,
    );
  }
  if (sortKey === "lat") return left.lat - right.lat;
  if (sortKey === "lon") return left.lon - right.lon;
  if (sortKey === "value1") {
    const difference =
      (left.data.magnitude ?? 0) - (right.data.magnitude ?? 0);
    if (difference !== 0) return difference;
    const leftLabel =
      left.data.magnitude !== undefined ? `M${left.data.magnitude}` : "";
    const rightLabel =
      right.data.magnitude !== undefined ? `M${right.data.magnitude}` : "";
    return leftLabel.localeCompare(rightLabel);
  }
  if (sortKey === "value2") {
    return (left.data.depth ?? 0) - (right.data.depth ?? 0);
  }
  return getAge(left, now) - getAge(right, now);
}

function table(
  points: readonly EarthquakePoint[],
  query: Extract<EarthquakeUiQuery, { kind: "table" }>,
  now: number,
): EarthquakeTableQueryResult {
  const filtered = points.filter((point) => {
    const magnitude = point.data.magnitude;
    return !(
      magnitude !== undefined &&
      query.minMagnitude > 0 &&
      magnitude < query.minMagnitude
    );
  });
  const direction = query.sortDirection === "asc" ? 1 : -1;
  filtered.sort(
    (left, right) =>
      compareTablePoints(left, right, query.sortKey, now) * direction,
  );
  return {
    kind: "table",
    total: filtered.length,
    items: filtered.slice(query.offset, query.offset + query.limit),
  };
}

function sortableTimestamp(point: EarthquakePoint): number {
  if (!point.timestamp) return 0;
  const timestamp = new Date(point.timestamp).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function runEarthquakeUiQuery(
  points: readonly EarthquakePoint[],
  query: EarthquakeUiQuery,
  now: number = Date.now(),
): EarthquakeUiQueryResult {
  if (query.kind === "search") return search(points, query.text);
  if (query.kind === "table") return table(points, query, now);
  if (query.kind === "ticker") {
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
  return {
    kind: "correlation",
    items: points.filter((point) => {
      const timestamp = point.timestamp
        ? new Date(point.timestamp).getTime()
        : now;
      return timestamp > query.since;
    }),
  };
}
