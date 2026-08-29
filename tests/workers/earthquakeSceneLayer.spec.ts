import { describe, expect, test } from "bun:test";
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
  sceneIds: ["quake-marker-high", "quake-marker-low"],
  entityIds: ["Qhigh", "Qlow"],
  positions: new Float64Array([20, 10, -20, -10]),
  motionPositions: new Float64Array(),
  motionPositionStride: 0,
  unitVectors: new Float32Array(6),
  timestamps: new Float64Array([
    TestInstant.EventSceneNow - 30 * MS_PER_MINUTE,
    TestInstant.EventSceneNow - 4 * MS_PER_DAY,
  ]),
  attributes: new Float32Array([5, 2]),
  attributeStride:
    getPointSourceDefinition(Domain.Earthquake).sceneSchema.attributeStride,
  stringAttributes: new Uint32Array(),
  stringAttributeStride:
    getPointSourceDefinition(Domain.Earthquake).sceneSchema.stringAttributeStride,
  dictionary: [],
  geometries: [null, null],
} satisfies RenderSceneView;

const frame = {
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
};

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

function visuals(
  markers: PulsingMarker[] = [],
  fades: number[] = [],
  batches: DotBatch[] = [],
): MarkerVisualRenderer {
  return {
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
  };
}

describe("earthquake scene layer", () => {
  test("owns visibility, hit, selection, and animation", () => {
    const layer = new PulsingPointLayer(
      Domain.Earthquake,
      visuals(),
    );
    layer.apply(sceneRebaseCommand(Domain.Earthquake, view));
    layer.project(frame, filter());

    expect(
      layer.nearest(SceneHitKind.Point, 120, 90, 20, 10)
        ?.entityId,
    ).toBe(
      "Qhigh",
    );
    expect(layer.selectionAnchor("Qhigh")).toEqual({
      x: 120,
      y: 90,
      depth: 1,
    });
    expect(layer.includesEntity("Qlow", filter())).toBe(true);
    // The pulse only earns frames once the zoom passes its floor.
    expect(layer.hasTimeAnimation(false)).toBe(false);
    layer.draw({
      context: {} as OffscreenCanvasRenderingContext2D,
      color: "#ffaa00",
      selectedId: null,
      time: 1,
      now: TestInstant.EventSceneNow,
      zoomLevel: 3,
    });
    expect(layer.hasTimeAnimation(false)).toBe(true);
    expect(layer.hasTimeAnimation(true)).toBe(false);
  });

  test("uses source search handles and shared isolation", () => {
    const layer = new PulsingPointLayer(
      Domain.Earthquake,
      visuals(),
    );
    layer.apply(sceneRebaseCommand(Domain.Earthquake, view));
    layer.apply(
      sceneSearchCommand(Domain.Earthquake, [2], 1),
    );
    layer.project(frame, filter());

    expect(
      layer.nearest(SceneHitKind.Point, 80, 110, 20, 10)
        ?.entityId,
    ).toBe("Qlow");
    expect(
      layer.nearest(SceneHitKind.Point, 120, 90, 20, 10),
    ).toBeNull();

    layer.apply(
      sceneSearchCommand(Domain.Earthquake, [], 2, false),
    );
    layer.project(
      frame,
      filter({
        isolateMode: IsolateMode.Focus,
        isolatedType: Domain.Weather,
      }),
    );
    expect(
      layer.nearest(SceneHitKind.Point, 80, 110, 20, 10),
    ).toBeNull();
  });

  test("preserves age, size, pulse, and selection drawing", () => {
    const markers: PulsingMarker[] = [];
    const fades: number[] = [];
    const batches: DotBatch[] = [];
    const layer = new PulsingPointLayer(
      Domain.Earthquake,
      visuals(markers, fades, batches),
    );
    layer.apply(sceneRebaseCommand(Domain.Earthquake, view));
    layer.project(frame, filter());
    layer.draw({
      context: {} as OffscreenCanvasRenderingContext2D,
      color: "#ff00aa",
      selectedId: "Qhigh",
      time: 1,
      now: TestInstant.EventSceneNow,
      zoomLevel: 3,
    });

    expect(fades).toEqual([1, 0.5]);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.size).toBe(12);
    expect(markers[0]?.selected).toBe(true);
    expect(markers[0]?.glow).not.toBeNull();
    // The plain marker fills through the batch.
    expect(batches).toHaveLength(1);
    expect(batches[0]?.size).toBe(2);
    expect(batches[0]?.xs).toHaveLength(1);
  });

  test("rejects an incompatible schema", () => {
    const layer = new PulsingPointLayer(
      Domain.Earthquake,
      visuals(),
    );
    layer.apply(sceneRebaseCommand(
      Domain.Earthquake,
      { ...view, attributeStride: 2 },
    ));
    layer.project(frame, filter());
    expect(layer.includesEntity("Qhigh", filter())).toBe(false);
  });
});
