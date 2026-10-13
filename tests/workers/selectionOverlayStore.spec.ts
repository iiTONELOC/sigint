import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import type { AircraftRouteWaypoint } from "@shared/domain/aircraftDossier";
import type { ProjFn } from "@/lib/geo/render/types";
import { createRenderThemeFixture } from "../fixtures/renderTheme";
import {
  SelectionOverlayStore,
} from "@/workers/render/selectionOverlayStore";
import type {
  RenderSelectionOverlay,
  RenderSelectionSnapshot,
} from "@/workers/render/protocol";

function selection(revision: number): RenderSelectionSnapshot {
  return {
    revision,
    identity: {
      source: Domain.Aircraft,
      entityId: "aircraft-a",
      interactionId: "aircraft-a",
      pointType: Domain.Aircraft,
    },
  };
}

function overlay(revision: number): RenderSelectionOverlay {
  return {
    selection: selection(revision),
    trail: [],
    route: null,
  };
}

enum RouteFixture {
  PixelsPerDegree = 10,
}

const EQUATOR_ROUTE: readonly AircraftRouteWaypoint[] = [[0, 0], [0, 10], [0, 20]];

const FLAT: ProjFn = (lat, lon) => ({
  x: lon * RouteFixture.PixelsPerDegree,
  y: -lat * RouteFixture.PixelsPerDegree,
  z: 1,
});

type DashedStroke = Readonly<{ dash: readonly number[]; offset: number }>;
type Recording = Readonly<{ strokes: DashedStroke[]; arcs: number[] }>;

function recordingContext(recording: Recording): OffscreenCanvasRenderingContext2D {
  let dash: number[] = [];
  const target = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    lineJoin: "",
    lineCap: "",
    lineDashOffset: 0,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: (x: number) => {
      recording.arcs.push(x);
    },
    fill: () => undefined,
    setLineDash: (segments: number[]) => {
      dash = segments;
    },
    stroke: () => {
      if (dash.length > 0) recording.strokes.push({ dash, offset: target.lineDashOffset });
    },
  };
  return target as unknown as OffscreenCanvasRenderingContext2D;
}

function drawn(shown: RenderSelectionOverlay, longitude: number): Recording {
  const store = new SelectionOverlayStore();
  store.apply(shown, selection(1));
  const recording: Recording = { strokes: [], arcs: [] };
  store.draw({
    colors: createRenderThemeFixture(),
    context: recordingContext(recording),
    enabled: true,
    position: { id: "aircraft-a", latitude: 0, longitude, interpolated: true },
    project: FLAT,
  });
  return recording;
}

function dashOffsetAt(longitude: number): number {
  return drawn({ ...overlay(1), route: EQUATOR_ROUTE }, longitude).strokes[0]?.offset ?? Number.NaN;
}

function trailDotsAt(longitude: number): readonly number[] {
  return drawn({ ...overlay(1), trail: [{ lat: 0, lon: 0, ts: 1 }] }, longitude).arcs.map((x) => Math.round(x));
}

describe("SelectionOverlayStore", () => {
  test("accepts only the current selection revision and identity", () => {
    const store = new SelectionOverlayStore();
    const current = selection(2);

    expect(store.apply(overlay(1), current)).toBe(false);
    expect(store.snapshot()).toBeNull();
    expect(store.apply(overlay(2), current)).toBe(true);
    expect(store.snapshot()).toEqual(overlay(2));
  });

  test("rejects an identity collision at the same revision", () => {
    const store = new SelectionOverlayStore();
    const current = selection(2);
    const mismatched: RenderSelectionOverlay = {
      ...overlay(2),
      selection: {
        revision: 2,
        identity: {
          source: Domain.Ships,
          entityId: "aircraft-a",
          interactionId: "aircraft-a",
          pointType: Domain.Ships,
        },
      },
    };

    expect(store.apply(mismatched, current)).toBe(false);
  });

  test("anchors the unflown dashes to the ground so the plane flies over them", () => {
    expect([dashOffsetAt(5), dashOffsetAt(6), dashOffsetAt(15)]).toEqual([50, 60, 150]);
  });

  test("lays estimated dots fixed on the ground between the last report and the plane", () => {
    expect([trailDotsAt(10), trailDotsAt(12)]).toEqual([
      [0, 14, 28, 42, 56, 70],
      [0, 14, 28, 42, 56, 70, 84, 98],
    ]);
  });
});
