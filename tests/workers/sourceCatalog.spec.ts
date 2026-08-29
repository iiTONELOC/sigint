import { describe, expect, test } from "bun:test";
import type { AircraftPoint } from "@shared/domain/aircraft";
import {
  DATA_WORKER_PROTOCOL_VERSION,
  DataWorkerMessageType,
} from "@/workers/data/protocol";
import {
  SourceCatalog,
  SourceCatalogError,
  SourceCatalogErrorKind,
  type CatalogRenderBinding,
  type CatalogSource,
} from "@/workers/data/sourceCatalog";
import { Domain } from "@shared/domain/identity";

function aircraft(): AircraftPoint {
  return {
    id: "A1",
    type: Domain.Aircraft,
    position: [20, 10],
    data: { callsign: "EAGLE" },
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

type RenderProbe = Readonly<{
  binding: CatalogRenderBinding;
  calls: {
    rebases: number;
    searches: Array<Readonly<{
      active: boolean;
      entityIds: readonly string[];
      revision: number;
    }>>;
  };
}>;

function renderProbe(): RenderProbe {
  const calls: RenderProbe["calls"] = {
    rebases: 0,
    searches: [],
  };
  return {
    calls,
    binding: {
      publishRebase: () => {
        calls.rebases += 1;
      },
      publishSearch: (entityIds, revision, active) => {
        calls.searches.push({ entityIds, revision, active });
      },
    },
  };
}

describe("SourceCatalog", () => {
  test("owns lifecycle, lookup, queries, and render rebases", async () => {
    const probe = sourceProbe();
    const render = renderProbe();
    const catalog = new SourceCatalog();
    catalog.register(Domain.Aircraft, probe.owner, render.binding);

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
    expect(render.calls.rebases).toBe(1);
    expect(catalog.values(Domain.Aircraft)).toEqual([aircraft()]);
    expect(
      catalog.entity(
        Domain.Aircraft,
        {
          protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
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

  test("owns render search revision, refresh, clear, and reset", () => {
    const source = sourceProbe();
    const render = renderProbe();
    const catalog = new SourceCatalog();
    catalog.register(Domain.Aircraft, source.owner, render.binding);

    catalog.setRenderSearch({ revision: 1, text: "EAGLE" });
    catalog.refreshRenderSearch(Domain.Aircraft);
    catalog.setRenderSearch({ revision: 2, text: null });
    catalog.setRenderSearch({ revision: 1, text: "EAGLE" });
    catalog.resetRenderSearch();
    catalog.refreshRenderSearch(Domain.Aircraft);

    expect(render.calls.searches).toEqual([
      { entityIds: ["A1"], revision: 1, active: true },
      { entityIds: ["A1"], revision: 1, active: true },
      { entityIds: [], revision: 2, active: false },
    ]);
  });

  test("rejects duplicate source registration", () => {
    const probe = sourceProbe();
    const render = renderProbe();
    const catalog = new SourceCatalog();
    catalog.register(Domain.Aircraft, probe.owner, render.binding);

    expect(() => {
      catalog.register(Domain.Aircraft, probe.owner, render.binding);
    }).toThrow(
      new SourceCatalogError(
        SourceCatalogErrorKind.DuplicateSource,
        Domain.Aircraft,
      ),
    );
  });
});
