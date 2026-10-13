import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { SourceStatus } from "@shared/domain/sourceStatus";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import { PointUiQueryKind, type PointUiQuery } from "@/workers/data/uiQuery";
import { flushReactUpdates, renderHook } from "../../../support/react";

enum SourceQueryFixture {
  Version = 1,
}

const COUNT_QUERY: PointUiQuery = { kind: PointUiQueryKind.Count, filter: {} };

let snapshot: DataWorkerSourceSnapshot | null = null;
const querySource = mock(() => new Promise<never>(() => undefined));
const fakeClient = {
  getSourceSnapshot: () => snapshot,
  querySource,
  subscribeSource: () => () => undefined,
};
let activeClient: typeof fakeClient | null = fakeClient;
const realClientExports = { ...(await import("@/lib/cache/dataWorkerClient")) };
mock.module("@/lib/cache/dataWorkerClient", () => ({
  ...realClientExports,
  getDataWorkerClient: () => activeClient ?? realClientExports.getDataWorkerClient(),
}));

const { useSourceQuery } = await import("@/features/base/useSourceQuery");

function sourceSnapshot(status: SourceStatus): DataWorkerSourceSnapshot {
  return {
    count: 0,
    error: null,
    lastUpdatedAt: null,
    loading: status === SourceStatus.Loading,
    source: Domain.Aircraft,
    status,
    version: SourceQueryFixture.Version,
  };
}

function useAircraftCount() {
  return useSourceQuery(Domain.Aircraft, COUNT_QUERY);
}

beforeEach(() => {
  querySource.mockClear();
});

afterAll(() => {
  activeClient = null;
});

describe("useSourceQuery loading", () => {
  test("does not query a source that has not loaded yet", async () => {
    snapshot = sourceSnapshot(SourceStatus.Loading);
    const { result } = renderHook(useAircraftCount);
    await flushReactUpdates();

    expect(querySource).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  test("queries a source once it has loaded", async () => {
    snapshot = sourceSnapshot(SourceStatus.Live);
    renderHook(useAircraftCount);
    await flushReactUpdates();

    expect(querySource).toHaveBeenCalled();
  });
});
