import {
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { Domain } from "@shared/domain/identity";
import type { DataPoint } from "@/features/base/dataPoints";
import { TICKER_ITEM_LIMIT } from "@/lib/ui/tickerFeed";
import {
  QUERYABLE_SOURCE_IDS,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";
import {
  PointUiQueryKind,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";
import { renderHook } from "../../../../support/react";
import {
  TickerFixtureIndex,
  TickerFixturePointId,
  TickerFixturePriority,
  tickerAircraft,
} from "../fixtures";

enum TickerHookUnexpectedField {
  Filter = "filter",
  Layers = "layers",
}

enum TickerHookCount {
  Empty = 0,
}

enum TickerHookTestErrorMessage {
  QueryKind = "The ticker hook issued a non-ticker query.",
}

type TickerHookCall = Readonly<{
  query: PointUiQuery;
  source: QueryableSourceId;
}>;

type TickerHookResult = PointUiQueryResult<DataPoint>;

const queryCalls: TickerHookCall[] = [];
const sourceResults = new Map<
  QueryableSourceId,
  TickerHookResult | null
>();

mock.module("@/features/base/useSourceQuery", () => ({
  useSourceQuery: (
    source: QueryableSourceId,
    query: PointUiQuery,
  ) => {
    queryCalls.push({ query, source });
    return sourceResults.get(source) ?? null;
  },
}));

const { useSourceTicker } = await import(
  "@/features/base/useSourceTicker"
);

beforeEach(() => {
  queryCalls.length = TickerHookCount.Empty;
  sourceResults.clear();
});

function tickerResult(
  items: readonly DataPoint[],
  priorityCount: number = TickerFixturePriority.None,
): TickerHookResult {
  return {
    items,
    kind: PointUiQueryKind.Ticker,
    priorityCount,
  };
}

describe("useSourceTicker query contract", () => {
  test("requests one bounded ticker page from every feed source", () => {
    renderHook(useSourceTicker);
    const expectedSources = QUERYABLE_SOURCE_IDS.filter(
      (source) => source !== Domain.CycloneWarnings,
    );

    expect(queryCalls).toHaveLength(expectedSources.length);
    expect(
      new Set(queryCalls.map(({ source }) => source)),
    ).toEqual(new Set(expectedSources));
    for (const { query } of queryCalls) {
      if (query.kind !== PointUiQueryKind.Ticker) {
        throw new TypeError(TickerHookTestErrorMessage.QueryKind);
      }
      expect(query.limit).toBe(TICKER_ITEM_LIMIT);
      expect(TickerHookUnexpectedField.Filter in query).toBe(false);
      expect(TickerHookUnexpectedField.Layers in query).toBe(false);
    }
  });

  test("uses an empty page for absent and non-ticker results", () => {
    sourceResults.set(Domain.Aircraft, {
      items: [],
      kind: PointUiQueryKind.Count,
      total: TickerHookCount.Empty,
    });

    const { result } = renderHook(useSourceTicker);

    expect(result.current).toEqual([]);
  });
});

describe("useSourceTicker merge", () => {
  test("keeps priority items first and includes other source pages", () => {
    const priority = tickerAircraft(TickerFixturePointId.Alpha);
    const ordinary = tickerAircraft(TickerFixturePointId.Bravo);
    sourceResults.set(
      Domain.Aircraft,
      tickerResult([priority], TickerFixturePriority.One),
    );
    sourceResults.set(
      Domain.Ships,
      tickerResult([ordinary]),
    );

    const { result } = renderHook(useSourceTicker);

    expect(result.current.at(TickerFixtureIndex.First)).toBe(priority);
    expect(result.current).toContain(ordinary);
  });
});
