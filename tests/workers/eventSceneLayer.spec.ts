import { describe, expect, test } from "bun:test";
import { IntelSeverity } from "@shared/domain/correlation";
import type {
  DotBatch,
  MarkerVisualRenderer,
  PulsingMarker,
} from "@/workers/render/primitives/markerVisuals";
import { IsolateMode } from "@/workers/render/protocol";
import {
  PulsingPointLayer,
} from "@/workers/render/scene/sceneLayer";
import type { EnabledSceneFilter } from "@/workers/render/scene/visibility";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { SceneHitKind } from "@/workers/render/scene/projectedLayer";
import { Domain } from "@shared/domain/identity";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import { MS_PER_DAY, MS_PER_MINUTE } from "@shared/time";
import { TestInstant } from "../_support";
import {
  sceneRebaseCommand,
  sceneSearchCommand,
} from "../_support/scene";

const view = {
  capacity: 2,
  active: new Uint8Array([1, 1]),
  sceneIds: ["event-marker-a", "event-marker-b"],
  entityIds: ["event-a", "event-b"],
  positions: new Float64Array([20, 10, -20, -10]),
  motionPositions: new Float64Array(),
  motionPositionStride: 0,
  unitVectors: new Float32Array(6),
  timestamps: new Float64Array([
    TestInstant.EventSceneNow - 30 * MS_PER_MINUTE,
    TestInstant.EventSceneNow - 4 * MS_PER_DAY,
  ]),
  attributes: new Float32Array([
    IntelSeverity.Tension,
    IntelSeverity.Concern,
  ]),
  attributeStride:
    getPointSourceDefinition(Domain.Events).sceneSchema.attributeStride,
  stringAttributes: new Uint32Array(),
  stringAttributeStride:
    getPointSourceDefinition(Domain.Events).sceneSchema.stringAttributeStride,
  dictionary: [],
  geometries: [null, null],
} satisfies RenderSceneView;

function filter(
  values: Partial<EnabledSceneFilter> = {},
): EnabledSceneFilter {
  return {
    enabled: true,
    isolateMode: null,
    isolatedId: null,
    isolatedType: null,
    ...values,
  };
}

function project(
  layer: PulsingPointLayer,
  settings = filter(),
): void {
  layer.apply(sceneRebaseCommand(Domain.Events, view));
  layer.project({
    width: 200,
    height: 200,
    hitCellSize: 32,
    cullMargin: 0,
    flat: {
      centerX: 100,
      centerY: 100,
      mapWidth: 360,
      mapHeight: 180,
    },
    globe: null,
  }, settings);
}

describe("event scene layer", () => {
  test("owns visibility, hit testing, selection, and animation", () => {
    const visuals: MarkerVisualRenderer = {
      fade: (color) => color,
      fillDots: () => undefined,
      drawPulsing: () => undefined,
      drawPulseGlow: () => undefined,
    };
    const layer = new PulsingPointLayer(Domain.Events, visuals);
    project(layer);
    // The pulse only earns frames once the zoom passes its floor.
    expect(layer.hasTimeAnimation(false)).toBe(false);
    layer.draw({
      context: {} as OffscreenCanvasRenderingContext2D,
      color: "#ff00aa",
      selectedId: null,
      time: 1,
      now: TestInstant.EventSceneNow,
      zoomLevel: 3,
    });

    expect(
      layer.nearest(
        SceneHitKind.Point,
        120,
        90,
        20,
        10,
      )?.entityId,
    ).toBe("event-a");
    expect(layer.selectionAnchor("event-a")).toEqual({
      x: 120,
      y: 90,
      depth: 1,
    });
    expect(layer.hasTimeAnimation(false)).toBe(true);
    expect(layer.hasTimeAnimation(true)).toBe(false);

    layer.apply(sceneSearchCommand(Domain.Events, [2], 1));
    expect(layer.searchIncludesEntity("event-a")).toBe(false);
    expect(layer.searchIncludesEntity("event-b")).toBe(true);
    expect(layer.includesEntity("event-b", filter({
      isolateMode: IsolateMode.Focus,
      isolatedType: Domain.Weather,
    }))).toBe(false);
  });

  test("preserves severity size, age fade, pulse, and selection", () => {
    const fades: number[] = [];
    const markers: PulsingMarker[] = [];
    const batches: DotBatch[] = [];
    const glows: PulsingMarker[] = [];
    const visuals: MarkerVisualRenderer = {
      fade: (color, factor) => {
        fades.push(factor);
        return color;
      },
      fillDots: (_context, batch) => {
        batches.push(batch);
      },
      drawPulsing: (_context, _time, marker) => {
        markers.push(marker);
      },
      drawPulseGlow: (_context, _time, marker) => {
        glows.push(marker);
      },
    };
    const layer = new PulsingPointLayer(Domain.Events, visuals);
    project(layer);
    layer.draw({
      context: {} as OffscreenCanvasRenderingContext2D,
      color: "#ff00aa",
      selectedId: "event-a",
      time: 1,
      now: TestInstant.EventSceneNow,
      zoomLevel: 3,
    });

    expect(fades).toEqual([1, 0.45]);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.size).toBeCloseTo(3.6);
    expect(markers[0]?.selected).toBe(true);
    expect(markers[0]?.glow).not.toBeNull();
    // The plain marker fills through the batch, quantized to its bucket.
    expect(batches).toHaveLength(1);
    expect(batches[0]?.size).toBeCloseTo(1.25);
    expect(batches[0]?.xs).toHaveLength(1);
  });
});
