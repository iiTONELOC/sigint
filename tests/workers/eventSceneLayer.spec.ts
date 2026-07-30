import { describe, expect, test } from "bun:test";
import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import { EventSeverity } from "@/features/intel/events/types";
import type {
  MarkerVisualRenderer,
  PulsingMarker,
} from "@/workers/render/primitives/markerVisuals";
import { IsolateMode } from "@/workers/render/protocol";
import {
  EventLayer,
  eventSceneIncludes,
  type EventSceneFilter,
} from "@/workers/render/scene/eventLayer";
import { EventSceneSchema } from "@/workers/render/scene/eventSchema";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { Domain } from "@shared/domain/identity";
import { MS_PER_DAY, MS_PER_MINUTE } from "@shared/time";
import { TestInstant } from "../_support";
import { sceneRebaseCommand } from "../_support/scene";

const view = {
  capacity: 2,
  active: new Uint8Array([1, 1]),
  sceneIds: ["event-marker-a", "event-marker-b"],
  entityIds: ["event-a", "event-b"],
  positions: new Float64Array([20, 10, -20, -10]),
  unitVectors: new Float32Array(6),
  timestamps: new Float64Array([
    TestInstant.EventSceneNow - 30 * MS_PER_MINUTE,
    TestInstant.EventSceneNow - 4 * MS_PER_DAY,
  ]),
  attributes: new Float32Array([
    EventSeverity.Tension,
    EventSeverity.Concern,
  ]),
  attributeStride: EventSceneSchema.AttributeStride,
  stringAttributes: new Uint32Array(),
  stringAttributeStride: EventSceneSchema.StringAttributeStride,
  dictionary: [],
} satisfies RenderSceneView;

function filter(
  values: Partial<EventSceneFilter> = {},
): EventSceneFilter {
  return {
    enabled: true,
    searchIds: null,
    isolateMode: null,
    isolatedId: null,
    isolatedType: null,
    ...values,
  };
}

function project(layer: EventLayer, settings = filter()): void {
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
      drawPulsing: () => undefined,
    };
    const layer = new EventLayer(visuals);
    project(layer);

    expect(
      layer.nearest(120, 90, 20, 10)?.entityId,
    ).toBe("event-a");
    expect(layer.selectionAnchor("event-a")).toEqual({
      x: 120,
      y: 90,
      depth: 1,
    });
    expect(layer.hasTimeAnimation(false)).toBe(true);
    expect(layer.hasTimeAnimation(true)).toBe(false);

    expect(
      eventSceneIncludes(
        view,
        0,
        filter({ searchIds: new Set(["event-b"]) }),
      ),
    ).toBe(false);
    expect(
      eventSceneIncludes(
        view,
        1,
        filter({
          isolateMode: IsolateMode.Focus,
          isolatedType: Domain.Weather,
        }),
      ),
    ).toBe(false);
  });

  test("preserves severity size, age fade, pulse, and selection", () => {
    const fades: number[] = [];
    const markers: PulsingMarker[] = [];
    const visuals: MarkerVisualRenderer = {
      fade: (color, factor) => {
        fades.push(factor);
        return color;
      },
      drawPulsing: (_context, _time, marker) => {
        markers.push(marker);
      },
    };
    const layer = new EventLayer(visuals);
    project(layer);
    layer.draw({
      context: {} as Ctx,
      color: "#ff00aa",
      selectedId: "event-a",
      time: 1,
      now: TestInstant.EventSceneNow,
      zoomLevel: 3,
    });

    expect(fades).toEqual([1, 0.45]);
    expect(markers).toHaveLength(2);
    expect(markers[0]?.size).toBeCloseTo(3.6);
    expect(markers[0]?.selected).toBe(true);
    expect(markers[0]?.glow).not.toBeNull();
    expect(markers[1]?.size).toBeCloseTo(1.3);
    expect(markers[1]?.selected).toBe(false);
    expect(markers[1]?.glow).toBeNull();
  });
});
