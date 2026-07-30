import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import {
  SceneDataCommandType,
  type SceneSourcePatch,
} from "@/workers/render/sceneProtocol";
import {
  ShipSceneBinding,
  ShipSource,
} from "@/workers/data/sources/ships";
import type { ShipPoint } from "@/features/tracking/ships/data/codec";

function ship(heading: number): ShipPoint {
  return {
    id: "S123456789",
    type: Domain.Ships,
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

describe("ShipSource", () => {
  test("publishes a typed rebase and omits an unchanged refresh", async () => {
    const patches: SceneSourcePatch[] = [];
    const binding = new ShipSceneBinding((command) => {
      if (command.type === SceneDataCommandType.SourcePatch) {
        patches.push(command);
      }
    });
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
      publishStatus: () => undefined,
      publishPatch: (patch) => {
        binding.publish(patch);
      },
    });

    await source.refresh();
    await source.refresh();

    expect(patches).toHaveLength(2);
    expect(Array.from(patches[0]?.attributes ?? [])).toEqual([45]);
    expect(patches[1]?.handles).toHaveLength(0);
  });
});
