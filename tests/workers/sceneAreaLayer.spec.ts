import { describe, expect, test } from "bun:test";
import {
  WeatherSeverity,
  weatherSeverityRank,
} from "@shared/domain/weather";
import type {
  MarkerVisualRenderer,
  PulsingMarker,
} from "@/workers/render/primitives/markerVisuals";
import {
  CycloneWarningLayer,
} from "@/workers/render/scene/cycloneWarningLayer";
import {
  SceneHitKind,
} from "@/workers/render/scene/projectedLayer";
import {
  WeatherLayer,
  type WeatherSceneFilter,
} from "@/workers/render/scene/weatherLayer";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import {
  areaKindRank,
  AreaKind,
} from "@shared/domain/cyclones";
import { Domain } from "@shared/domain/identity";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import type { GeoMultiPolygon, GeoPoint } from "@shared/geo";
import { SceneGeometryKind } from "@shared/scene";
import { sceneRebaseCommand } from "../_support/scene";

const AREA_GEOMETRY: GeoMultiPolygon = [
  [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [2, 2],
      [2, 4],
      [4, 4],
      [4, 2],
      [2, 2],
    ],
  ],
  [
    [
      [20, 20],
      [22, 20],
      [22, 22],
      [20, 22],
      [20, 20],
    ],
  ],
];

const FRAME = {
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
  areaProjection: {
    project: (latitude: number, longitude: number) => ({
      x: longitude,
      y: latitude,
      z: 1,
    }),
    horizon: null,
  },
  screenPoint: (x: number, y: number): GeoPoint => [x, y],
};

const WEATHER_VIEW = {
  capacity: 1,
  active: new Uint8Array([1]),
  sceneIds: ["weather-scene"],
  entityIds: ["weather-entity"],
  positions: new Float64Array([20, 10]),
  motionPositions: new Float64Array(),
  motionPositionStride: 0,
  unitVectors: new Float32Array(3),
  timestamps: new Float64Array([1]),
  attributes: new Float32Array([
    weatherSeverityRank(WeatherSeverity.Severe),
  ]),
  attributeStride:
    getPointSourceDefinition(Domain.Weather).sceneSchema.attributeStride,
  stringAttributes: new Uint32Array(),
  stringAttributeStride:
    getPointSourceDefinition(Domain.Weather).sceneSchema.stringAttributeStride,
  dictionary: [],
  geometries: [{
    kind: SceneGeometryKind.Polygon,
    groups: AREA_GEOMETRY,
  }],
} satisfies RenderSceneView;

const WARNING_VIEW = {
  ...WEATHER_VIEW,
  sceneIds: ["warning-scene"],
  entityIds: ["warning-entity"],
  attributes: new Float32Array([areaKindRank(AreaKind.Watch)]),
  attributeStride:
    getPointSourceDefinition(Domain.CycloneWarnings).sceneSchema.attributeStride,
  stringAttributeStride:
    getPointSourceDefinition(Domain.CycloneWarnings).sceneSchema
      .stringAttributeStride,
} satisfies RenderSceneView;

function filter(): WeatherSceneFilter {
  return {
    enabled: true,
    isolateMode: null,
    isolatedId: null,
    isolatedType: null,
  };
}

function visuals(markers: PulsingMarker[]): MarkerVisualRenderer {
  return {
    fade: (color) => color,
    fillDots: () => undefined,
    drawPulsing: (_context, _time, marker) => {
      markers.push(marker);
    },
  };
}

type FillRecord = Readonly<{
  alpha: number;
  color: string;
}>;

function context(fills: FillRecord[]): OffscreenCanvasRenderingContext2D {
  const target = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    fill: () => {
      fills.push({
        alpha: target.globalAlpha,
        color: target.fillStyle,
      });
    },
    stroke: () => undefined,
  };
  return target as unknown as OffscreenCanvasRenderingContext2D;
}

describe("scene area layers", () => {
  test("weather preserves holes, multipolygons, marker hit, and drawing", () => {
    const markers: PulsingMarker[] = [];
    const fills: FillRecord[] = [];
    const layer = new WeatherLayer(visuals(markers));
    layer.apply(sceneRebaseCommand(Domain.Weather, WEATHER_VIEW));
    layer.project(FRAME, filter());

    expect(
      layer.nearest(SceneHitKind.Point, 120, 90, 10, 10)
        ?.entityId,
    ).toBe("weather-entity");
    expect(
      layer.nearest(SceneHitKind.Area, 1, 1, 10, 10)
        ?.entityId,
    ).toBe("weather-entity");
    expect(
      layer.nearest(SceneHitKind.Area, 3, 3, 10, 10),
    ).toBeNull();
    expect(
      layer.nearest(SceneHitKind.Area, 21, 21, 10, 10)
        ?.entityId,
    ).toBe("weather-entity");

    const drawingContext = context(fills);
    layer.drawAreas({
      context: drawingContext,
      selectedId: "weather-entity",
      time: 0,
    });
    layer.draw({
      context: drawingContext,
      color: "#abcdef",
      selectedId: "weather-entity",
      time: 0,
      zoomLevel: 3,
    });

    expect(fills).toHaveLength(2);
    expect(fills[0]?.alpha).toBeCloseTo(0.52);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.size).toBe(9);
    expect(markers[0]?.fillAlpha).toBeCloseTo(0.72);
    expect(markers[0]?.glow).not.toBeNull();
    expect(layer.hasTimeAnimation(false)).toBe(true);
  });

  test("warning preserves area kind, containment, and visibility", () => {
    const fills: FillRecord[] = [];
    const layer = new CycloneWarningLayer();
    layer.apply(
      sceneRebaseCommand(Domain.CycloneWarnings, WARNING_VIEW),
    );
    layer.project(FRAME, filter());

    expect(
      layer.nearest(SceneHitKind.Area, 1, 1, 10, 10)
        ?.entityId,
    ).toBe("warning-entity");
    layer.drawAreas({
      context: context(fills),
      selectedId: "warning-entity",
      time: 0,
      warningColor: "#ff0000",
      watchColor: "#ffff00",
    });
    expect(fills[0]?.alpha).toBeCloseTo(0.44);
    expect(fills[0]?.color).toBe("#ffff00");

    layer.project(FRAME, { ...filter(), enabled: false });
    expect(
      layer.nearest(SceneHitKind.Area, 1, 1, 10, 10),
    ).toBeNull();
  });
});
