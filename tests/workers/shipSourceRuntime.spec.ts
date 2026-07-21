import { describe, expect, test } from "bun:test";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";
import {
  createShipSourceRuntime,
  type ShipSourceRuntimeOptions,
} from "@/workers/data/sources/ships";
import type { ShipPoint } from "@/features/tracking/ships/data/codec";

function ship(heading: number): ShipPoint {
  return {
    id: "S123456789",
    type: "ships",
    lat: 10,
    lon: 20,
    timestamp: "2026-07-21T00:00:00.000Z",
    data: {
      mmsi: 123456789,
      heading,
      speedMps: 10,
    },
  };
}

describe("ship source runtime", () => {
  test("publishes a typed rebase and omits an unchanged refresh", async () => {
    const patches: SceneSourcePatch[] = [];
    const options = {
      readCache: async () => null,
      persistCache: async () => undefined,
      fetchSnapshot: async () => ({
        completeness: "complete",
        entities: [ship(45)],
        observedAt: 10,
      }),
      publishStatus: () => undefined,
      publishScene: (patch) => {
        patches.push(patch);
      },
    } satisfies ShipSourceRuntimeOptions;
    const runtime = createShipSourceRuntime(options);

    await runtime.refresh();
    await runtime.refresh();

    expect(patches).toHaveLength(2);
    expect(Array.from(patches[0]?.attributes ?? [])).toEqual([45]);
    expect(patches[1]?.handles).toHaveLength(0);
  });
});
