import { describe, expect, test } from "bun:test";
import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import {
  SaffirSimpson,
  type MinCategory,
} from "@/features/environmental/cyclones/types";
import {
  CycloneSceneBinding,
} from "@/workers/data/render-codecs/cycloneSceneBinding";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  CycloneLayer,
  type CycloneSceneFilter,
} from "@/workers/render/scene/cycloneLayer";
import {
  cycloneForecastSceneId,
} from "@/workers/render/scene/cycloneSchema";
import {
  SceneHitKind,
} from "@/workers/render/scene/projectedLayer";
import {
  createSceneDataCommand,
  SceneDataCommandType,
  type SceneSourceCommandBody,
} from "@/workers/render/sceneProtocol";
import { Domain } from "@shared/domain/identity";
import {
  TEST_CYCLONE_FORECAST,
  testCycloneScenePoint,
} from "../_support/cyclone";

enum TestProjection {
  Width = 400,
  Height = 200,
  CenterX = 200,
  CenterY = 100,
  MapWidth = 360,
  MapHeight = 180,
  HitCellSize = 32,
  CullMargin = 24,
}

type DrawRecord = Readonly<{
  fills: unknown[];
  strokes: unknown[];
}>;

function context(records: DrawRecord): Ctx {
  const target = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    arc: () => undefined,
    fill: () => {
      records.fills.push(target.fillStyle);
    },
    stroke: () => {
      records.strokes.push(target.strokeStyle);
    },
    setLineDash: () => undefined,
    createRadialGradient: () => ({
      addColorStop: () => undefined,
    }),
  };
  return target as unknown as Ctx;
}

function frame() {
  return {
    width: TestProjection.Width,
    height: TestProjection.Height,
    hitCellSize: TestProjection.HitCellSize,
    cullMargin: TestProjection.CullMargin,
    flat: {
      centerX: TestProjection.CenterX,
      centerY: TestProjection.CenterY,
      mapWidth: TestProjection.MapWidth,
      mapHeight: TestProjection.MapHeight,
    },
    globe: null,
  };
}

function filter(
  showForecast: boolean,
  minCategory: MinCategory = SaffirSimpson.None,
): CycloneSceneFilter {
  return {
    enabled: true,
    minCategory,
    showForecast,
    showWindField: true,
    showModels: true,
    hiddenModels: new Set<string>(),
    searchIds: null,
    isolateMode: null,
    isolatedId: null,
    isolatedType: null,
  };
}

function sceneCommand(): Extract<
  SceneSourceCommandBody,
  { type: SceneDataCommandType.SourcePatch }
> {
  const commands: SceneSourceCommandBody[] = [];
  const binding = new CycloneSceneBinding((command) => {
    commands.push(command);
  });
  binding.publish({
    kind: DatasetPatchKind.Rebase,
    version: 1,
    upserts: [testCycloneScenePoint()],
    deletedIds: [],
  });
  const published = commands[0];
  expect(published?.type).toBe(SceneDataCommandType.SourcePatch);
  if (published?.type !== SceneDataCommandType.SourcePatch) {
    return {
      type: SceneDataCommandType.SourcePatch,
      source: Domain.Cyclones,
      sourceVersion: 1,
      kind: DatasetPatchKind.Rebase,
      handles: new Uint32Array(),
      sceneIds: [],
      entityIds: [],
      positions: new Float64Array(),
      unitVectors: new Float32Array(),
      timestamps: new Float64Array(),
      attributes: new Float32Array(),
      attributeStride: 0,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: 0,
      dictionaryStart: 0,
      dictionaryValues: [],
      geometryKinds: new Uint8Array(),
      geometryCoordinates: new Float64Array(),
      geometryPartEnds: new Uint32Array(),
      geometryGroupEnds: new Uint32Array(),
      geometryRecordEnds: new Uint32Array(),
      deletedHandles: new Uint32Array(),
    };
  }
  return published;
}

describe("cyclone scene layer", () => {
  test("uses forecast interaction identity and draws the scene records", () => {
    const point = testCycloneScenePoint();
    const forecastId = cycloneForecastSceneId(
      point.data.stormId,
      point.data.forecast[0]?.fcstHour ?? 0,
    );
    const layer = new CycloneLayer();
    layer.apply(
      createSceneDataCommand(sceneCommand(), "session-a", 1),
    );
    layer.project(frame(), filter(true));

    const hit = layer.nearest(
      SceneHitKind.Point,
      126,
      74,
      0.5,
      10,
    );
    expect(hit?.sceneId).toBe(forecastId);
    expect(hit ? layer.interactionIdentity(hit) : null).toEqual({
      source: Domain.Cyclones,
      entityId: point.id,
      interactionId: forecastId,
      pointType: Domain.CyclonesForecast,
    });
    expect(layer.selectionAnchor(forecastId)).not.toBeNull();
    expect(layer.selectionTarget(forecastId)).toEqual({
      identity: {
        source: Domain.Cyclones,
        entityId: point.id,
        interactionId: forecastId,
        pointType: Domain.CyclonesForecast,
      },
      latitude: TEST_CYCLONE_FORECAST.lat,
      longitude: TEST_CYCLONE_FORECAST.lon,
    });

    const records: DrawRecord = { fills: [], strokes: [] };
    layer.draw({
      context: context(records),
      project: (lat, lon) => ({ x: lon, y: lat, z: 1 }),
      color: "#ff2b3d",
      selectedId: forecastId,
      time: 1,
      reducedMotion: false,
      showCone: true,
    });

    expect(records.fills[0]).toBe("#ff2b3d");
    expect(records.fills).toContain("#ffd24a");
    expect(records.strokes).toContain("#8a5cff");
    expect(layer.hasTimeAnimation(false)).toBe(true);
    expect(layer.hasTimeAnimation(true)).toBe(false);
  });

  test("applies forecast visibility and category filters", () => {
    const layer = new CycloneLayer();
    layer.apply(
      createSceneDataCommand(sceneCommand(), "session-b", 1),
    );

    layer.project(frame(), filter(false));
    expect(
      layer.nearest(SceneHitKind.Point, 126, 74, 0.5, 10),
    ).toBeNull();

    layer.project(frame(), filter(true, SaffirSimpson.Cat3));
    expect(
      layer.nearest(SceneHitKind.Point, 125, 75, 1, 10),
    ).toBeNull();
  });
});
