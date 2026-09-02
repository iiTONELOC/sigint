import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  AisNavigationStatus,
  type ShipPoint,
} from "@shared/domain/ships";
import { SourceCompleteness } from "@shared/source";
import { ktToMps } from "@/measurements";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  SceneDataCommandType,
  type SceneSourcePatch,
} from "@/workers/render/sceneProtocol";
import {
  shipSceneBinding,
  ShipSource,
} from "@/workers/data/sources/ships";
import type {
  MovingSceneTrailReader,
} from "@/workers/data/render-codecs/movingSceneRecord";

function ship(
  heading: number,
  cog: number | null = 90,
): ShipPoint {
  return {
    id: "S123456789",
    type: Domain.Ships,
    position: [20, 10],
    timestamp: "2026-07-21T00:00:00.000Z",
    data: {
      mmsi: 123456789,
      heading,
      navStatus: AisNavigationStatus.NotDefined,
      sog: 10,
      ...(cog === null ? {} : { cog }),
    },
  };
}

function shipTrailReader(): MovingSceneTrailReader {
  return {
    lastPoint: (source, id) =>
      source === Domain.Ships && id === "S123456789"
        ? {
            lat: 40,
            lon: -74,
            ts: 100,
          }
        : null,
  };
}

describe("ShipSource", () => {
  test("publishes a typed rebase and omits an unchanged refresh", async () => {
    const patches: SceneSourcePatch[] = [];
    const binding = shipSceneBinding(
      shipTrailReader(),
      (command) => {
        if (command.type === SceneDataCommandType.SourcePatch) {
          patches.push(command);
        }
      },
    );
    const source = new ShipSource({
      fetchSnapshot: async () => ({
        completeness: SourceCompleteness.Complete,
        entities: [ship(45)],
        observedAt: 10,
      }),
    });
    source.attach({
      readCache: async () => null,
      persistCache: () => undefined,
      deleteCache: () => undefined,
      publishStatus: () => undefined,
      publishPatch: (patch) => {
        binding.publish(patch);
      },
    });

    await source.refresh();
    await source.refresh();

    expect(patches).toHaveLength(2);
    expect(Array.from(patches[0]?.attributes ?? [])).toEqual([
      45,
      90,
      Math.fround(ktToMps(10)),
    ]);
    expect(Array.from(patches[0]?.motionPositions ?? [])).toEqual([
      -74,
      40,
    ]);
    expect(Array.from(patches[0]?.positions ?? [])).toEqual([
      20,
      10,
    ]);
    expect(Array.from(patches[0]?.timestamps ?? [])).toEqual([
      100,
    ]);
    expect(patches[1]?.handles).toHaveLength(0);
  });

  test("uses heading when the current ship course is absent", () => {
    const patches: SceneSourcePatch[] = [];
    const binding = shipSceneBinding(
      shipTrailReader(),
      (command) => {
        if (command.type === SceneDataCommandType.SourcePatch) {
          patches.push(command);
        }
      },
    );

    binding.publish({
      kind: DatasetPatchKind.Rebase,
      version: 1,
      upserts: [ship(45, null)],
      deletedIds: [],
    });

    expect(Array.from(patches[0]?.attributes ?? [])).toEqual([
      45,
      45,
      Math.fround(ktToMps(10)),
    ]);
    expect(Array.from(patches[0]?.motionPositions ?? [])).toEqual([
      -74,
      40,
    ]);
  });
});
