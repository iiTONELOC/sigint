import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import {
  recordLatitude,
  recordLongitude,
  type PositionedRecord,
} from "@/workers/data/source-model/position";
import { isRecord } from "@shared/geo";
import { isEnumValue } from "@shared/types/enum";

enum SearchScore {
  None = 0,
  ExactPrimary = 100,
  PrimaryPrefix = 51,
  Base = 1,
  WordExact = 30,
  WordPrefix = 15,
  PositionMax = 10,
  PositionDecay = 0.5,
}

export enum PointUiQueryKind {
  Search = "search",
  Table = "table",
  Ticker = "ticker",
  BoundingBox = "bbox",
  Count = "count",
  Facet = "facet",
  Correlation = "correlation",
}

export enum TableSortKey {
  Type = "type",
  Name = "name",
  Latitude = "lat",
  Longitude = "lon",
  Value1 = "value1",
  Value2 = "value2",
  Age = "age",
}

export enum TableSortDirection {
  Ascending = "asc",
  Descending = "desc",
}

export type TableSortKeyValue = `${TableSortKey}`;
export type TableSortDirectionValue = `${TableSortDirection}`;
type SearchQueryKind = `${PointUiQueryKind.Search}`;
type TableQueryKind = `${PointUiQueryKind.Table}`;
type TickerQueryKind = `${PointUiQueryKind.Ticker}`;
type BoundingBoxQueryKind = `${PointUiQueryKind.BoundingBox}`;
type CountQueryKind = `${PointUiQueryKind.Count}`;
type FacetQueryKind = `${PointUiQueryKind.Facet}`;
type CorrelationQueryKind = `${PointUiQueryKind.Correlation}`;

export const TABLE_SORT_KEYS: readonly TableSortKey[] =
  Object.values(TableSortKey);

export type PointUiQuery =
  | Readonly<{ kind: SearchQueryKind; text: string }>
  | Readonly<{
      kind: TableQueryKind;
      minValue: number;
      sortKey: TableSortKeyValue;
      sortDirection: TableSortDirectionValue;
      offset: number;
      limit: number;
    }>
  | Readonly<{ kind: TickerQueryKind; limit: number }>
  | Readonly<{
      kind: BoundingBoxQueryKind;
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
      limit: number;
    }>
  | Readonly<{ kind: CountQueryKind; filter: unknown }>
  | Readonly<{ kind: FacetQueryKind; limit: number }>
  | Readonly<{ kind: CorrelationQueryKind; since: number }>;

export type PointUiQueryResult<TPoint> =
  | Readonly<{
      kind: SearchQueryKind;
      total: number;
      items: readonly TPoint[];
    }>
  | Readonly<{
      kind: TableQueryKind;
      total: number;
      items: readonly TPoint[];
    }>
  | Readonly<{
      kind: TickerQueryKind;
      /** Leading items that must stay ahead of the rest of the feed. */
      priorityCount: number;
      items: readonly TPoint[];
    }>
  | Readonly<{
      kind: BoundingBoxQueryKind;
      total: number;
      items: readonly TPoint[];
    }>
  | Readonly<{
      kind: CountQueryKind;
      total: number;
      items: readonly TPoint[];
    }>
  | Readonly<{
      kind: FacetQueryKind;
      /** Distinct facet values, most frequent first. */
      values: readonly string[];
      items: readonly TPoint[];
    }>
  | Readonly<{
      kind: CorrelationQueryKind;
      items: readonly TPoint[];
    }>;

export type TimestampedPoint = Readonly<{
  id: string;
  timestamp?: string;
}> &
  PositionedRecord;

export type PointUiQueryDescriptor<TPoint extends TimestampedPoint> = Readonly<{
  parseEntity: (value: unknown) => TPoint | null;
  searchText: (point: TPoint) => string;
  primaryLabel: (point: TPoint) => string;
  nameLabel: (point: TPoint) => string;
  value1: (point: TPoint) => number;
  value1Label: (point: TPoint) => string;
  value2: (point: TPoint) => number;
  includeInTable: (point: TPoint, minValue: number) => boolean;
  /** Whether a point is live enough to belong in the ticker feed. */
  includeInTicker: (point: TPoint) => boolean;
  /** Whether a point must lead the feed, ahead of every other source. */
  tickerPriority: (point: TPoint) => boolean;
  /** Whether a point survives this source's UI filter. The filter crosses a
   *  worker boundary as unknown, so each source narrows its own shape. */
  matchesFilter: (point: TPoint, filter: unknown) => boolean;
  /** The value a filter control offers as a choice, for sources whose filter
   *  needs the set actually present in the data. */
  filterFacet: (point: TPoint) => string | null;
  supportsCorrelation: boolean;
}>;

/** Sources whose filter controls offer no data-derived choices. */
export function noFilterFacet(): string | null {
  return null;
}

/**
 * The shape every threshold filter shares: an enabled switch plus one minimum
 * the source ranks its points against. Narrowed here so five sources do not
 * each hand-roll the same guard.
 */
export function matchesThresholdFilter(
  filter: unknown,
  minimumKey: string,
  rank: number | null,
): boolean {
  if (!isRecord(filter) || filter.enabled !== true) return false;
  const minimum = filter[minimumKey];
  if (typeof minimum !== "number" || minimum <= 0) return true;
  return rank === null || rank >= minimum;
}

/** Sources with no liveness notion: every point is ticker eligible. */
export function alwaysInTicker(): boolean {
  return true;
}

/** Sources with no escalation notion: no point outranks the feed order. */
export function neverTickerPriority(): boolean {
  return false;
}

const TABLE_SORT_KEY_SET: ReadonlySet<string> =
  new Set(TABLE_SORT_KEYS);

function isTableSortKey(value: unknown): value is TableSortKeyValue {
  return (
    typeof value === "string" &&
    TABLE_SORT_KEY_SET.has(value)
  );
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseSearchQuery(value: Record<string, unknown>): PointUiQuery | null {
  if (typeof value.text !== "string" || value.text.trim().length === 0) {
    return null;
  }
  return { kind: PointUiQueryKind.Search, text: value.text };
}

function parseTableQuery(value: Record<string, unknown>): PointUiQuery | null {
  if (
    !isNonNegativeNumber(value.minValue) ||
    !isTableSortKey(value.sortKey) ||
    !isEnumValue(value.sortDirection, TableSortDirection) ||
    !isNonNegativeInteger(value.offset) ||
    !isPositiveInteger(value.limit)
  ) {
    return null;
  }
  return {
    kind: PointUiQueryKind.Table,
    minValue: value.minValue,
    sortKey: value.sortKey,
    sortDirection: value.sortDirection,
    offset: value.offset,
    limit: value.limit,
  };
}

function parseTickerQuery(value: Record<string, unknown>): PointUiQuery | null {
  return isPositiveInteger(value.limit)
    ? { kind: PointUiQueryKind.Ticker, limit: value.limit }
    : null;
}

function parseBboxQuery(value: Record<string, unknown>): PointUiQuery | null {
  const { minLat, maxLat, minLon, maxLon, limit } = value;
  if (
    !isFiniteNumber(minLat) ||
    !isFiniteNumber(maxLat) ||
    !isFiniteNumber(minLon) ||
    !isFiniteNumber(maxLon) ||
    !isPositiveInteger(limit) ||
    minLat > maxLat ||
    minLon > maxLon
  ) {
    return null;
  }
  return {
    kind: PointUiQueryKind.BoundingBox,
    minLat,
    maxLat,
    minLon,
    maxLon,
    limit,
  };
}

function parseCountQuery(value: Record<string, unknown>): PointUiQuery | null {
  // The filter stays unknown here: only the source's own descriptor knows
  // which shape it should be, and it narrows before reading a field.
  return "filter" in value
    ? { kind: PointUiQueryKind.Count, filter: value.filter }
    : null;
}

function parseFacetQuery(value: Record<string, unknown>): PointUiQuery | null {
  return isPositiveInteger(value.limit)
    ? { kind: PointUiQueryKind.Facet, limit: value.limit }
    : null;
}

function parseCorrelationQuery(
  value: Record<string, unknown>,
): PointUiQuery | null {
  return isNonNegativeNumber(value.since)
    ? {
        kind: PointUiQueryKind.Correlation,
        since: value.since,
      }
    : null;
}

const QUERY_PARSERS: Readonly<
  Record<
    PointUiQueryKind,
    (value: Record<string, unknown>) => PointUiQuery | null
  >
> = {
  [PointUiQueryKind.Search]: parseSearchQuery,
  [PointUiQueryKind.Table]: parseTableQuery,
  [PointUiQueryKind.Ticker]: parseTickerQuery,
  [PointUiQueryKind.BoundingBox]: parseBboxQuery,
  [PointUiQueryKind.Count]: parseCountQuery,
  [PointUiQueryKind.Facet]: parseFacetQuery,
  [PointUiQueryKind.Correlation]: parseCorrelationQuery,
};

export function parsePointUiQuery(
  value: unknown,
  supportsCorrelation: boolean,
): PointUiQuery | null {
  if (
    !isRecord(value) ||
    !isEnumValue(value.kind, PointUiQueryKind)
  ) {
    return null;
  }
  if (
    value.kind === PointUiQueryKind.Correlation &&
    !supportsCorrelation
  ) {
    return null;
  }
  return QUERY_PARSERS[value.kind]?.(value) ?? null;
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
    (value.kind === PointUiQueryKind.Search ||
      value.kind === PointUiQueryKind.Table ||
      value.kind === PointUiQueryKind.BoundingBox ||
      value.kind === PointUiQueryKind.Count) &&
    isNonNegativeInteger(value.total)
  ) {
    return { kind: value.kind, total: value.total, items };
  }
  if (
    value.kind === PointUiQueryKind.Facet &&
    Array.isArray(value.values) &&
    value.values.every((entry: unknown) => typeof entry === "string")
  ) {
    return {
      kind: PointUiQueryKind.Facet,
      values: value.values,
      items,
    };
  }
  if (
    value.kind === PointUiQueryKind.Ticker &&
    isNonNegativeInteger(value.priorityCount)
  ) {
    return {
      kind: PointUiQueryKind.Ticker,
      priorityCount: value.priorityCount,
      items,
    };
  }
  if (value.kind === PointUiQueryKind.Correlation) {
    return { kind: PointUiQueryKind.Correlation, items };
  }
  return null;
}

export function scorePointSearchMatch(
  query: string,
  searchText: string,
  primary: string,
): number {
  const normalizedQuery = query.toLowerCase();
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  if (words.length === 0) return SearchScore.None;

  const normalizedText = searchText.toLowerCase();
  const normalizedPrimary = primary.toLowerCase();
  for (const word of words) {
    if (!normalizedText.includes(word)) return SearchScore.None;
  }
  if (normalizedPrimary === normalizedQuery) {
    return SearchScore.ExactPrimary;
  }

  let score = normalizedPrimary.startsWith(normalizedQuery)
    ? SearchScore.PrimaryPrefix
    : SearchScore.Base;
  for (const word of words) {
    if (normalizedPrimary === word) score += SearchScore.WordExact;
    else if (normalizedPrimary.startsWith(word)) {
      score += SearchScore.WordPrefix;
    }
  }
  for (const word of words) {
    const index = normalizedText.indexOf(word);
    if (index >= 0) {
      score += Math.max(
        0,
        SearchScore.PositionMax - index * SearchScore.PositionDecay,
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
    const score = scorePointSearchMatch(
      text,
      descriptor.searchText(point),
      descriptor.primaryLabel(point),
    );
    if (score > SearchScore.None) matches.push({ point, score });
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
  sortKey: TableSortKeyValue,
  descriptor: PointUiQueryDescriptor<TPoint>,
  now: number,
): number {
  if (sortKey === TableSortKey.Type) return 0;
  if (sortKey === TableSortKey.Name) {
    return descriptor.nameLabel(left).localeCompare(descriptor.nameLabel(right));
  }
  if (sortKey === TableSortKey.Latitude) {
    return recordLatitude(left) - recordLatitude(right);
  }
  if (sortKey === TableSortKey.Longitude) {
    return recordLongitude(left) - recordLongitude(right);
  }
  if (sortKey === TableSortKey.Value1) {
    return (
      descriptor.value1(left) - descriptor.value1(right) ||
      descriptor.value1Label(left).localeCompare(descriptor.value1Label(right))
    );
  }
  if (sortKey === TableSortKey.Value2) {
    return descriptor.value2(left) - descriptor.value2(right);
  }
  return pointAge(left, now) - pointAge(right, now);
}

/**
 * The newest eligible points, escalated ones first. priorityCount lets the
 * caller merge pages from several sources without re-testing each point.
 */
function runTickerQuery<TPoint extends TimestampedPoint>(
  points: readonly TPoint[],
  query: Extract<PointUiQuery, { kind: TickerQueryKind }>,
  descriptor: PointUiQueryDescriptor<TPoint>,
): PointUiQueryResult<TPoint> {
  const eligible = points.filter(descriptor.includeInTicker);
  eligible.sort((left, right) => {
    const byPriority =
      Number(descriptor.tickerPriority(right)) -
      Number(descriptor.tickerPriority(left));
    return byPriority || pointTimestamp(right) - pointTimestamp(left);
  });
  const items = eligible.slice(0, query.limit);
  return {
    kind: PointUiQueryKind.Ticker,
    priorityCount: items.filter(descriptor.tickerPriority).length,
    items,
  };
}

/** Distinct facet values ranked by how many points carry them. */
function runFacetQuery<TPoint extends TimestampedPoint>(
  points: readonly TPoint[],
  query: Extract<PointUiQuery, { kind: FacetQueryKind }>,
  descriptor: PointUiQueryDescriptor<TPoint>,
): PointUiQueryResult<TPoint> {
  const tally = new Map<string, number>();
  for (const point of points) {
    const value = descriptor.filterFacet(point);
    if (value) tally.set(value, (tally.get(value) ?? 0) + 1);
  }
  const values = Array.from(tally.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, query.limit)
    .map(([value]) => value);
  return { kind: PointUiQueryKind.Facet, values, items: [] };
}

function runBboxQuery<TPoint extends TimestampedPoint>(
  points: readonly TPoint[],
  query: Extract<
    PointUiQuery,
    { kind: BoundingBoxQueryKind }
  >,
): PointUiQueryResult<TPoint> {
  const inside = points.filter((point) => {
    const latitude = recordLatitude(point);
    const longitude = recordLongitude(point);
    return (
      latitude >= query.minLat &&
      latitude <= query.maxLat &&
      longitude >= query.minLon &&
      longitude <= query.maxLon
    );
  });
  return {
    kind: PointUiQueryKind.BoundingBox,
    total: inside.length,
    items: inside.slice(0, query.limit),
  };
}

export function runPointUiQuery<TPoint extends TimestampedPoint>(
  points: readonly TPoint[],
  query: PointUiQuery,
  descriptor: PointUiQueryDescriptor<TPoint>,
  now: number = Date.now(),
): PointUiQueryResult<TPoint> {
  if (query.kind === PointUiQueryKind.BoundingBox) {
    return runBboxQuery(points, query);
  }
  if (query.kind === PointUiQueryKind.Facet) {
    return runFacetQuery(points, query, descriptor);
  }

  if (query.kind === PointUiQueryKind.Count) {
    // Count only: the caller wants a number, so no page is carried back.
    return {
      kind: PointUiQueryKind.Count,
      total: points.filter((point) => descriptor.matchesFilter(point, query.filter))
        .length,
      items: [],
    };
  }

  if (query.kind === PointUiQueryKind.Search) {
    const matched = searchMatches(points, query.text, descriptor);
    return {
      kind: PointUiQueryKind.Search,
      total: matched.length,
      items: matched.slice(0, POINT_UI_QUERY_POLICY.searchResultLimit),
    };
  }

  if (query.kind === PointUiQueryKind.Table) {
    const filtered = points.filter((point) =>
      descriptor.includeInTable(point, query.minValue),
    );
    const direction =
      query.sortDirection === TableSortDirection.Ascending ? 1 : -1;
    filtered.sort(
      (left, right) =>
        compareTable(left, right, query.sortKey, descriptor, now) * direction,
    );
    return {
      kind: PointUiQueryKind.Table,
      total: filtered.length,
      items: filtered.slice(query.offset, query.offset + query.limit),
    };
  }

  if (query.kind === PointUiQueryKind.Ticker) {
    return runTickerQuery(points, query, descriptor);
  }

  return {
    kind: PointUiQueryKind.Correlation,
    items: points.filter(
      (point) => (pointTimestamp(point) || now) > query.since,
    ),
  };
}

// ── Per-source bindings ─────────────────────────────────────────────

export type PointUiQueries<TPoint extends TimestampedPoint> = Readonly<{
  descriptor: PointUiQueryDescriptor<TPoint>;
  parseQuery: (value: unknown) => PointUiQuery | null;
  parseResult: (value: unknown) => PointUiQueryResult<TPoint> | null;
  findSearchIds: (points: readonly TPoint[], text: string) => string[];
  run: (
    points: readonly TPoint[],
    query: PointUiQuery,
    now?: number,
  ) => PointUiQueryResult<TPoint>;
}>;

/** One call binds a descriptor to the whole query surface for its source. */
export function createPointUiQueries<TPoint extends TimestampedPoint>(
  descriptor: PointUiQueryDescriptor<TPoint>,
): PointUiQueries<TPoint> {
  return {
    descriptor,
    parseQuery: (value) =>
      parsePointUiQuery(value, descriptor.supportsCorrelation),
    parseResult: (value) =>
      parsePointUiQueryResult(value, descriptor.parseEntity),
    findSearchIds: (points, text) =>
      findPointSearchIds(points, text, descriptor),
    run: (points, query, now = Date.now()) =>
      runPointUiQuery(points, query, descriptor, now),
  };
}
