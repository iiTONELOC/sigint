import { describe, expect, test } from "bun:test";
import type {
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
  sceneIds: ["fire-marker-high", "fire-marker-low"],
  entityIds: ["FI-high", "FI-low"],
  positions: new Float64Array([20, 10, -20, -10]),
  motionPositions: new Float64Array(),
  motionPositionStride: 0,
  unitVectors: new Float32Array(6),
  timestamps: new Float64Array([
    TestInstant.EventSceneNow - 30 * MS_PER_MINUTE,
    TestInstant.EventSceneNow - MS_PER_DAY,
  ]),
  attributes: new Float32Array([35, 10]),
  attributeStride:
    getPointSourceDefinition(Domain.Fire).sceneSchema.attributeStride,
  stringAttributes: new Uint32Array(),
  stringAttributeStride:
    getPointSourceDefinition(Domain.Fire).sceneSchema.stringAttributeStride,
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
): MarkerVisualRenderer {
  return {
    fade: (color, factor) => {
      fades.push(factor);
      return color;
    },
    drawPulsing: (_context, _time, marker) => {
      markers.push(marker);
    },
  };
}

describe("fire scene layer", () => {
  test("owns visibility, hit, selection, and animation", () => {
    const layer = new PulsingPointLayer(Domain.Fire, visuals());
    layer.apply(sceneRebaseCommand(Domain.Fire, view));
    layer.project(frame, filter());

    expect(
      layer.nearest(SceneHitKind.Point, 120, 90, 20, 10)
        ?.entityId,
    ).toBe(
      "FI-high",
    );
    expect(layer.selectionAnchor("FI-high")).toEqual({
      x: 120,
      y: 90,
      depth: 1,
    });
    expect(layer.includesEntity("FI-low", filter())).toBe(true);
    expect(layer.hasTimeAnimation(false)).toBe(true);
    expect(layer.hasTimeAnimation(true)).toBe(false);
  });

  test("uses source search handles and shared isolation", () => {
    const layer = new PulsingPointLayer(Domain.Fire, visuals());
    layer.apply(sceneRebaseCommand(Domain.Fire, view));
    layer.apply(sceneSearchCommand(Domain.Fire, [2], 1));
    layer.project(frame, filter());

    expect(
      layer.nearest(SceneHitKind.Point, 80, 110, 20, 10)
        ?.entityId,
    ).toBe(
      "FI-low",
    );
    expect(
      layer.nearest(SceneHitKind.Point, 120, 90, 20, 10),
    ).toBeNull();

    layer.apply(sceneSearchCommand(Domain.Fire, [], 2, false));
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
    const layer = new PulsingPointLayer(
      Domain.Fire,
      visuals(markers, fades),
    );
    layer.apply(sceneRebaseCommand(Domain.Fire, view));
    layer.project(frame, filter());
    layer.draw({
      context: {} as OffscreenCanvasRenderingContext2D,
      color: "#ff5500",
      selectedId: "FI-high",
      time: 1,
      now: TestInstant.EventSceneNow,
      zoomLevel: 3,
    });

    expect(fades).toEqual([1, 0.5]);
    expect(markers).toHaveLength(2);
    expect(markers[0]?.size).toBe(5);
    expect(markers[0]?.selected).toBe(true);
    expect(markers[0]?.glow).not.toBeNull();
    expect(markers[1]?.size).toBe(1.8);
    expect(markers[1]?.selected).toBe(false);
    expect(markers[1]?.glow).toBeNull();
  });

  test("rejects an incompatible schema", () => {
    const layer = new PulsingPointLayer(Domain.Fire, visuals());
    layer.apply(sceneRebaseCommand(
      Domain.Fire,
      { ...view, attributeStride: 2 },
    ));
    layer.project(frame, filter());
    expect(layer.includesEntity("FI-high", filter())).toBe(false);
  });
});
