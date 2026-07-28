import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import { isRecord } from "@shared/geo";

const SEARCH_SCORE = {
  none: 0,
  exactPrimary: 100,
  primaryPrefix: 51,
  base: 1,
  wordExact: 30,
  wordPrefix: 15,
  positionMax: 10,
  positionDecay: 0.5,
} as const;

export const TABLE_SORT_KEYS = [
  "type",
  "name",
  "lat",
  "lon",
  "value1",
  "value2",
  "age",
] as const;

export type TableSortKey = (typeof TABLE_SORT_KEYS)[number];
export type TableSortDirection = "asc" | "desc";

export type PointUiQuery =
  | Readonly<{ kind: "search"; text: string }>
  | Readonly<{
      kind: "table";
      minValue: number;
      sortKey: TableSortKey;
      sortDirection: TableSortDirection;
      offset: number;
      limit: number;
    }>
  | Readonly<{ kind: "ticker"; limit: number }>
  | Readonly<{ kind: "correlation"; since: number }>;

export type PointUiQueryResult<TPoint> =
  | Readonly<{ kind: "search"; total: number; items: readonly TPoint[] }>
  | Readonly<{ kind: "table"; total: number; items: readonly TPoint[] }>
  | Readonly<{ kind: "ticker"; items: readonly TPoint[] }>
  | Readonly<{ kind: "correlation"; items: readonly TPoint[] }>;

export type TimestampedPoint = Readonly<{
  id: string;
  lat: number;
  lon: number;
  timestamp?: string;
}>;

export type PointUiQueryDescriptor<TPoint extends TimestampedPoint> = Readonly<{
  parseEntity: (value: unknown) => TPoint | null;
  searchText: (point: TPoint) => string;
  primaryLabel: (point: TPoint) => string;
  nameLabel: (point: TPoint) => string;
  value1: (point: TPoint) => number;
  value1Label: (point: TPoint) => string;
  value2: (point: TPoint) => number;
  includeInTable: (point: TPoint, minValue: number) => boolean;
  supportsCorrelation: boolean;
}>;

const TABLE_SORT_KEY_SET: ReadonlySet<string> = new Set(TABLE_SORT_KEYS);

function isTableSortKey(value: unknown): value is TableSortKey {
  return typeof value === "string" && TABLE_SORT_KEY_SET.has(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parsePointUiQuery(
  value: unknown,
  supportsCorrelation: boolean,
): PointUiQuery | null {
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
    isNonNegativeNumber(value.minValue) &&
    isTableSortKey(value.sortKey) &&
    (value.sortDirection === "asc" || value.sortDirection === "desc") &&
    isNonNegativeInteger(value.offset) &&
    isPositiveInteger(value.limit)
  ) {
    return {
      kind: "table",
      minValue: value.minValue,
      sortKey: value.sortKey,
      sortDirection: value.sortDirection,
      offset: value.offset,
      limit: value.limit,
    };
  }

  if (value.kind === "ticker" && isPositiveInteger(value.limit)) {
    return { kind: "ticker", limit: value.limit };
  }

  if (
    supportsCorrelation &&
    value.kind === "correlation" &&
    isNonNegativeNumber(value.since)
  ) {
    return { kind: "correlation", since: value.since };
  }

  return null;
}

export function parsePointUiQueryResult<TPoint extends TimestampedPoint>(
  value: unknown,
  parseEntity: (candidate: unknown) => TPoint | null,
): PointUiQueryResult<TPoint> | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;

  const items: TPoint[] = [];
  for (const candidate of value.items) {
    const point = parseEntity(candidate);
    if (!point) return null;
    items.push(point);
  }

  if (
    (value.kind === "search" || value.kind === "table") &&
    isNonNegativeInteger(value.total)
  ) {
    return { kind: value.kind, total: value.total, items };
  }
  if (value.kind === "ticker") return { kind: "ticker", items };
  if (value.kind === "correlation") return { kind: "correlation", items };
  return null;
}

function scoreSearchMatch(
  query: string,
  searchText: string,
  primary: string,
): number {
  const normalizedQuery = query.toLowerCase();
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  if (words.length === 0) return SEARCH_SCORE.none;

  const normalizedText = searchText.toLowerCase();
  const normalizedPrimary = primary.toLowerCase();
  for (const word of words) {
    if (!normalizedText.includes(word)) return SEARCH_SCORE.none;
  }
  if (normalizedPrimary === normalizedQuery) return SEARCH_SCORE.exactPrimary;

  let score = normalizedPrimary.startsWith(normalizedQuery)
    ? SEARCH_SCORE.primaryPrefix
    : SEARCH_SCORE.base;
  for (const word of words) {
    if (normalizedPrimary === word) score += SEARCH_SCORE.wordExact;
    else if (normalizedPrimary.startsWith(word)) {
      score += SEARCH_SCORE.wordPrefix;
    }
  }
  for (const word of words) {
    const index = normalizedText.indexOf(word);
    if (index >= 0) {
      score += Math.max(
        0,
        SEARCH_SCORE.positionMax - index * SEARCH_SCORE.positionDecay,
      );
    }
  }
  return score;
}

function searchMatches<TPoint extends TimestampedPoint>(
  points: readonly TPoint[],
  text: string,
  descriptor: PointUiQueryDescriptor<TPoint>,
): TPoint[] {
  const matches: Array<{ point: TPoint; score: number }> = [];
  for (const point of points) {
    const score = scoreSearchMatch(
      text,
      descriptor.searchText(point),
      descriptor.primaryLabel(point),
    );
    if (score > SEARCH_SCORE.none) matches.push({ point, score });
  }
  matches.sort((left, right) => right.score - left.score);
  return matches.map((match) => match.point);
}

export function findPointSearchIds<TPoint extends TimestampedPoint>(
  points: readonly TPoint[],
  text: string,
  descriptor: PointUiQueryDescriptor<TPoint>,
): string[] {
  return searchMatches(points, text, descriptor).map((point) => point.id);
}

function pointTimestamp(point: TimestampedPoint): number {
  if (!point.timestamp) return 0;
  const parsed = Date.parse(point.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pointAge(point: TimestampedPoint, now: number): number {
  if (!point.timestamp) return 0;
  return now - pointTimestamp(point);
}

function compareTable<TPoint extends TimestampedPoint>(
  left: TPoint,
  right: TPoint,
  sortKey: TableSortKey,
  descriptor: PointUiQueryDescriptor<TPoint>,
  now: number,
): number {
  if (sortKey === "type") return 0;
  if (sortKey === "name") {
    return descriptor.nameLabel(left).localeCompare(descriptor.nameLabel(right));
  }
  if (sortKey === "lat") return left.lat - right.lat;
  if (sortKey === "lon") return left.lon - right.lon;
  if (sortKey === "value1") {
    return (
      descriptor.value1(left) - descriptor.value1(right) ||
      descriptor.value1Label(left).localeCompare(descriptor.value1Label(right))
    );
  }
  if (sortKey === "value2") {
    return descriptor.value2(left) - descriptor.value2(right);
  }
  return pointAge(left, now) - pointAge(right, now);
}

export function runPointUiQuery<TPoint extends TimestampedPoint>(
  points: readonly TPoint[],
  query: PointUiQuery,
  descriptor: PointUiQueryDescriptor<TPoint>,
  now: number = Date.now(),
): PointUiQueryResult<TPoint> {
  if (query.kind === "search") {
    const matched = searchMatches(points, query.text, descriptor);
    return {
      kind: "search",
      total: matched.length,
      items: matched.slice(0, POINT_UI_QUERY_POLICY.searchResultLimit),
    };
  }

  if (query.kind === "table") {
    const filtered = points.filter((point) =>
      descriptor.includeInTable(point, query.minValue),
    );
    const direction = query.sortDirection === "asc" ? 1 : -1;
    filtered.sort(
      (left, right) =>
        compareTable(left, right, query.sortKey, descriptor, now) * direction,
    );
    return {
      kind: "table",
      total: filtered.length,
      items: filtered.slice(query.offset, query.offset + query.limit),
    };
  }

  if (query.kind === "ticker") {
    return {
      kind: "ticker",
      items: [...points]
        .sort((left, right) => pointTimestamp(right) - pointTimestamp(left))
        .slice(0, query.limit),
    };
  }

  return {
    kind: "correlation",
    items: points.filter(
      (point) => (pointTimestamp(point) || now) > query.since,
    ),
  };
}
