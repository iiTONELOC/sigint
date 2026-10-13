import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  QUERYABLE_SOURCE_IDS,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";
import {
  PointUiQueryKind,
  TableSortDirection,
  TableSortKey,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";
import { renderHook } from "../../../support/react";

enum SourceTableFixture {
  Limit = 10,
  None = 0,
}

const sourceResults = new Map<QueryableSourceId, PointUiQueryResult<DataPoint>>();

function mockSourceQueries(
  request: (source: QueryableSourceId) => PointUiQuery | null,
) {
  return Object.fromEntries(
    QUERYABLE_SOURCE_IDS.map((source) => [
      source,
      request(source) ? (sourceResults.get(source) ?? null) : null,
    ]),
  );
}

let mocking = true;
const realQueryExports = { ...(await import("@/features/base/useSourceQuery")) };
mock.module("@/features/base/useSourceQuery", () => ({
  ...realQueryExports,
  useSourceQueries: (
    request: (source: QueryableSourceId) => PointUiQuery | null,
  ) => (mocking ? mockSourceQueries(request) : realQueryExports.useSourceQueries(request)),
}));

const { useSourceTables } = await import("@/features/base/useSourceTables");

function useAllTables() {
  return useSourceTables({
    limit: SourceTableFixture.Limit,
    pointType: null,
    sortDirection: TableSortDirection.Ascending,
    sortKey: TableSortKey.Type,
  });
}

function emptyTable(): PointUiQueryResult<DataPoint> {
  return {
    items: [],
    kind: PointUiQueryKind.Table,
    total: SourceTableFixture.None,
  };
}

beforeEach(() => {
  sourceResults.clear();
});

afterAll(() => {
  mocking = false;
});

describe("useSourceTables readiness", () => {
  test("is not ready before any requested source answers", () => {
    const { result } = renderHook(useAllTables);

    expect(result.current.ready).toBe(false);
  });

  test("is not ready while a requested source has not answered", () => {
    sourceResults.set(Domain.Ships, emptyTable());
    const { result } = renderHook(useAllTables);

    expect(result.current.ready).toBe(false);
  });

  test("is ready once every requested source answers, even with no rows", () => {
    for (const source of QUERYABLE_SOURCE_IDS) {
      sourceResults.set(source, emptyTable());
    }
    const { result } = renderHook(useAllTables);

    expect(result.current.ready).toBe(true);
  });
});
