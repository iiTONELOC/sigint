import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { type PointType } from "@shared/domain/pointType";
import { SquawkStatus } from "@shared/domain/aircraft";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";
import {
  createAircraftSourceRuntime,
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

describe("aircraft source runtime", () => {
  test("publishes a typed rebase and omits an unchanged refresh", async () => {
    const scenePatches: SceneSourcePatch[] = [];
    const runtime = createAircraftSourceRuntime({
      readCache: async () => null,
      persistCache: async () => undefined,
      fetchSnapshot: async () => ({
        completeness: "complete",
        entities: [aircraft(90)],
        observedAt: 10,
      }),
      publishStatus: () => undefined,
      publishScene: (patch) => {
        scenePatches.push(patch);
      },
    });

    await runtime.refresh();
    await runtime.refresh();

    expect(scenePatches).toHaveLength(2);
    expect(scenePatches[0]?.kind).toBe("rebase");
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
    expect(scenePatches[1]?.kind).toBe("patch");
    expect(scenePatches[1]?.handles).toHaveLength(0);
  });
});
