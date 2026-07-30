import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import type {
  TrailEntry,
} from "@/lib/geo/trails/trailStore";
import {
  SelectionInterestService,
} from "@/workers/data/selectionInterestService";
import type {
  SceneSelectionOverlay,
} from "@/workers/render/sceneProtocol";
import type {
  AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";

function routeReader(
  route: readonly AircraftRouteWaypoint[] | null = null,
): Readonly<{
  route: () => Promise<readonly AircraftRouteWaypoint[] | null>;
}> {
  return {
    route: async () => route,
  };
}

function aircraftEntry(lastSeen: number): TrailEntry {
  return {
    type: Domain.Aircraft,
    points: [{
      lat: 40,
      lon: -74,
      ts: lastSeen,
    }],
    lastSeen,
    heading: 90,
    speedMps: 200,
  };
}

describe("SelectionInterestService", () => {
  test("publishes trail and motion for the selected source entity", () => {
    let entry = aircraftEntry(100);
    const overlays: SceneSelectionOverlay[] = [];
    const service = new SelectionInterestService(
      {
        get: () => entry,
      },
      routeReader(),
      (overlay) => {
        overlays.push(overlay);
      },
    );

    expect(service.update({
      revision: 1,
      identity: {
        source: Domain.Aircraft,
        entityId: "aircraft-a",
        interactionId: "aircraft-a",
        pointType: Domain.Aircraft,
      },
    })).toBe(true);
    expect(overlays[0]?.trail).toEqual(entry.points);
    expect(overlays[0]?.motion).toEqual({
      lat: 40,
      lon: -74,
      ts: 100,
      headingDeg: 90,
      speedMps: 200,
    });

    entry = aircraftEntry(200);
    expect(service.refresh(Domain.Aircraft)).toBe(true);
    expect(overlays[1]?.trail).toEqual(entry.points);
  });

  test("rejects stale revisions and publishes a clear", () => {
    const overlays: SceneSelectionOverlay[] = [];
    const service = new SelectionInterestService(
      {
        get: () => null,
      },
      routeReader(),
      (overlay) => {
        overlays.push(overlay);
      },
    );

    expect(service.update({
      revision: 2,
      identity: null,
    })).toBe(true);
    expect(service.update({
      revision: 1,
      identity: null,
    })).toBe(false);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({
      selection: {
        revision: 2,
        identity: null,
      },
      trail: [],
      motion: null,
      route: null,
    });
  });

  test("accepts the new session revision after reconnect", () => {
    const overlays: SceneSelectionOverlay[] = [];
    const service = new SelectionInterestService(
      {
        get: () => null,
      },
      routeReader(),
      (overlay) => {
        overlays.push(overlay);
      },
    );

    expect(service.update({
      revision: 5,
      identity: null,
    })).toBe(true);
    service.connect();
    expect(service.update({
      revision: 1,
      identity: null,
    })).toBe(true);
    expect(overlays).toHaveLength(2);
    expect(overlays[1]?.selection.revision).toBe(1);
  });

  test("does not publish a trail owned by another source", () => {
    const overlays: SceneSelectionOverlay[] = [];
    const service = new SelectionInterestService(
      {
        get: () => ({
          ...aircraftEntry(100),
          type: Domain.Ships,
        }),
      },
      routeReader(),
      (overlay) => {
        overlays.push(overlay);
      },
    );

    expect(service.update({
      revision: 1,
      identity: {
        source: Domain.Aircraft,
        entityId: "aircraft-a",
        interactionId: "aircraft-a",
        pointType: Domain.Aircraft,
      },
    })).toBe(true);
    expect(overlays[0]?.trail).toEqual([]);
    expect(overlays[0]?.motion).toBeNull();
  });

  test("publishes the selected aircraft route after it resolves", async () => {
    const route: readonly AircraftRouteWaypoint[] = [
      [40.6, -73.7],
      [33.9, -118.4],
    ];
    const overlays: SceneSelectionOverlay[] = [];
    const service = new SelectionInterestService(
      { get: () => aircraftEntry(100) },
      routeReader(route),
      (overlay) => {
        overlays.push(overlay);
      },
    );

    service.update({
      revision: 1,
      identity: {
        source: Domain.Aircraft,
        entityId: "aircraft-a",
        interactionId: "aircraft-a",
        pointType: Domain.Aircraft,
      },
    });
    await Promise.resolve();

    expect(overlays).toHaveLength(2);
    expect(overlays[0]?.route).toBeNull();
    expect(overlays[1]?.route).toEqual(route);
  });

  test("does not publish a route resolved for a stale selection", async () => {
    let resolveRoute = (
      _route: readonly AircraftRouteWaypoint[] | null,
    ): void => undefined;
    const pendingRoute = new Promise<
      readonly AircraftRouteWaypoint[] | null
    >((resolve) => {
      resolveRoute = resolve;
    });
    const overlays: SceneSelectionOverlay[] = [];
    const service = new SelectionInterestService(
      { get: () => null },
      { route: () => pendingRoute },
      (overlay) => {
        overlays.push(overlay);
      },
    );

    service.update({
      revision: 1,
      identity: {
        source: Domain.Aircraft,
        entityId: "aircraft-a",
        interactionId: "aircraft-a",
        pointType: Domain.Aircraft,
      },
    });
    service.update({ revision: 2, identity: null });
    resolveRoute([
      [40.6, -73.7],
      [33.9, -118.4],
    ]);
    await pendingRoute;

    expect(overlays).toHaveLength(2);
    expect(overlays.at(-1)?.selection.revision).toBe(2);
    expect(overlays.at(-1)?.route).toBeNull();
  });
});
