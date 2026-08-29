import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import type { AircraftPoint } from "@shared/domain/aircraft";
import { ktToMps } from "@/measurements";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  SceneDataCommandType,
  type SceneSourcePatch,
} from "@/workers/render/sceneProtocol";
import {
  aircraftSceneBinding,
  AircraftSource,
} from "@/workers/data/sources/aircraft";
import type {
  MovingSceneTrailReader,
} from "@/workers/data/render-codecs/movingSceneRecord";

function aircraft(
  heading: number,
  latitude = 10,
  longitude = 20,
  speedKnots = 200,
): AircraftPoint {
  return {
    id: "Aabc123",
    type: Domain.Aircraft,
    position: [longitude, latitude],
    timestamp: "2026-07-21T00:00:00.000Z",
    data: {
      heading,
      speed: speedKnots,
      military: true,
      recon: false,
      onGround: false,
      originCountry: "United States",
    },
  };
}

function aircraftTrailReader(): MovingSceneTrailReader {
  return {
    lastPoint: (source, id) =>
      source === Domain.Aircraft && id === "Aabc123"
        ? {
            lat: 40.123456789012,
            lon: -74.123456789012,
            ts: 100,
          }
        : null,
  };
}

describe("AircraftSource", () => {
  test("publishes a typed rebase and omits an unchanged refresh", async () => {
    const scenePatches: SceneSourcePatch[] = [];
    const binding = aircraftSceneBinding(
      aircraftTrailReader(),
      (command) => {
        if (command.type === SceneDataCommandType.SourcePatch) {
          scenePatches.push(command);
        }
      },
    );
    const source = new AircraftSource({
      fetchSnapshot: async () => ({
        completeness: SourceCompleteness.Complete,
        entities: [aircraft(90)],
        observedAt: 10,
      }),
    });
    source.attach({
      readCache: async () => null,
      persistCache: () => undefined,
      publishStatus: () => undefined,
      publishPatch: (patch) => {
        binding.publish(patch);
      },
    });

    await source.refresh();
    await source.refresh();

    expect(scenePatches).toHaveLength(2);
    expect(scenePatches[0]?.kind).toBe(DatasetPatchKind.Rebase);
    expect(Array.from(scenePatches[0]?.handles ?? [])).toEqual([1]);
    expect(Array.from(scenePatches[0]?.attributes ?? [])).toEqual([
      90,
      1,
      0,
      90,
      Math.fround(ktToMps(200)),
    ]);
    expect(scenePatches[0]?.motionPositions).toBeInstanceOf(
      Float64Array,
    );
    expect(
      Array.from(scenePatches[0]?.motionPositions ?? []),
    ).toEqual([
      -74.123456789012,
      40.123456789012,
    ]);
    expect(Array.from(scenePatches[0]?.positions ?? [])).toEqual([
      20,
      10,
    ]);
    expect(Array.from(scenePatches[0]?.timestamps ?? [])).toEqual([
      100,
    ]);
    expect(
      Array.from(scenePatches[0]?.stringAttributes ?? []),
    ).toEqual([1]);
    expect(scenePatches[0]?.dictionaryValues).toEqual([
      "United States",
    ]);
    expect(scenePatches[1]?.kind).toBe(DatasetPatchKind.Patch);
    expect(scenePatches[1]?.handles).toHaveLength(0);
  });

  test("keeps the trail origin while current position and motion change", () => {
    const patches: SceneSourcePatch[] = [];
    const binding = aircraftSceneBinding(
      aircraftTrailReader(),
      (command) => {
        if (command.type === SceneDataCommandType.SourcePatch) {
          patches.push(command);
        }
      },
    );

    binding.publish({
      kind: DatasetPatchKind.Rebase,
      version: 1,
      upserts: [aircraft(90)],
      deletedIds: [],
    });
    binding.publish({
      kind: DatasetPatchKind.Patch,
      version: 2,
      upserts: [aircraft(180, 10.0001, 20.0001, 250)],
      deletedIds: [],
    });

    expect(Array.from(patches[1]?.attributes ?? [])).toEqual([
      180,
      1,
      0,
      180,
      Math.fround(ktToMps(250)),
    ]);
    expect(Array.from(patches[1]?.positions ?? [])).toEqual([
      20.0001,
      10.0001,
    ]);
    expect(Array.from(patches[1]?.motionPositions ?? [])).toEqual([
      -74.123456789012,
      40.123456789012,
    ]);
    expect(Array.from(patches[1]?.timestamps ?? [])).toEqual([
      100,
    ]);
  });

  test("uses raw aircraft position when no trail point exists", () => {
    const patches: SceneSourcePatch[] = [];
    const binding = aircraftSceneBinding(
      { lastPoint: () => null },
      (command) => {
        if (command.type === SceneDataCommandType.SourcePatch) {
          patches.push(command);
        }
      },
    );

    binding.publish({
      kind: DatasetPatchKind.Rebase,
      version: 1,
      upserts: [aircraft(90)],
      deletedIds: [],
    });

    expect(Array.from(patches[0]?.attributes ?? [])).toEqual([
      90,
      1,
      0,
      0,
      0,
    ]);
    expect(Array.from(patches[0]?.motionPositions ?? [])).toEqual([
      20,
      10,
    ]);
    expect(Array.from(patches[0]?.timestamps ?? [])).toEqual([
      0,
    ]);
  });
});
