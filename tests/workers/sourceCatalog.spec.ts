import { describe, expect, test } from "bun:test";
import type { AircraftPoint } from "@/features/tracking/aircraft/data/codec";
import {
  DataWorkerMessageType,
  DataWorkerProtocolVersion,
} from "@/workers/data/protocol";
import {
  SourceCatalog,
  SourceCatalogError,
  SourceCatalogErrorKind,
  type CatalogSource,
} from "@/workers/data/sourceCatalog";
import { Domain } from "@shared/domain/identity";

function aircraft(): AircraftPoint {
  return {
    id: "A1",
    type: Domain.Aircraft,
    lat: 10,
    lon: 20,
    data: {},
  };
}

type SourceProbe = Readonly<{
  owner: CatalogSource<AircraftPoint>;
  calls: {
    hydrate: number;
    refresh: number;
    start: number;
  };
}>;

function sourceProbe(): SourceProbe {
  const point = aircraft();
  const calls = {
    hydrate: 0,
    refresh: 0,
    start: 0,
  };
  return {
    calls,
    owner: {
      get: (id) => (id === point.id ? point : null),
      values: () => [point],
      snapshot: () => ({ version: 3 }),
      hydrate: async () => {
        calls.hydrate += 1;
      },
      refresh: async () => {
        calls.refresh += 1;
      },
      start: async () => {
        calls.start += 1;
      },
    },
  };
}

describe("SourceCatalog", () => {
  test("owns lifecycle, lookup, queries, and render rebases", async () => {
    const probe = sourceProbe();
    const catalog = new SourceCatalog();
    let rebases = 0;
    catalog.register(Domain.Aircraft, probe.owner, () => {
      rebases += 1;
    });

    expect(catalog.has(Domain.Aircraft)).toBe(true);
    expect(catalog.has(Domain.News)).toBe(false);
    await catalog.startAll();
    await catalog.refresh(Domain.Aircraft);
    catalog.publishRenderRebases();

    expect(probe.calls).toEqual({
      hydrate: 1,
      refresh: 1,
      start: 1,
    });
    expect(rebases).toBe(1);
    expect(catalog.values(Domain.Aircraft)).toEqual([aircraft()]);
    expect(
      catalog.entity(
        Domain.Aircraft,
        {
          protocolVersion: DataWorkerProtocolVersion.Current,
          requestId: 7,
        },
        "A1",
      ),
    ).toMatchObject({
      type: DataWorkerMessageType.SourceEntity,
      source: Domain.Aircraft,
      sourceVersion: 3,
    });
  });

  test("rejects duplicate source registration", () => {
    const probe = sourceProbe();
    const catalog = new SourceCatalog();
    catalog.register(Domain.Aircraft, probe.owner, () => undefined);

    expect(() => {
      catalog.register(Domain.Aircraft, probe.owner, () => undefined);
    }).toThrow(
      new SourceCatalogError(
        SourceCatalogErrorKind.DuplicateSource,
        Domain.Aircraft,
      ),
    );
  });
});
