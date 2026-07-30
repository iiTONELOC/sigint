import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import { SquawkStatus } from "@shared/domain/aircraft";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";
import {
  AircraftSceneBinding,
  AircraftSource,
  type AircraftPoint,
} from "@/workers/data/sources/aircraft";

function aircraft(heading: number): AircraftPoint {
  return {
    id: "Aabc123",
    type: Domain.Aircraft,
    lat: 10,
    lon: 20,
    timestamp: "2026-07-21T00:00:00.000Z",
    data: {
      heading,
      military: true,
      recon: false,
      onGround: false,
      squawkStatus: SquawkStatus.Normal,
      originCountry: "United States",
    },
  };
}

describe("AircraftSource", () => {
  test("publishes a typed rebase and omits an unchanged refresh", async () => {
    const scenePatches: SceneSourcePatch[] = [];
    const binding = new AircraftSceneBinding((patch) => {
      scenePatches.push(patch);
    });
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
});
