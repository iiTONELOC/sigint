import { describe, expect, test } from "bun:test";
import type { EventPoint } from "@/features/intel/events/data/codec";
import { IntelSeverity } from "@shared/domain/correlation";
import { eventSceneBinding } from "@/workers/data/sources/events";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  EventSource,
  eventWindowDurationMs,
} from "@/workers/data/sources/events";
import { EventSceneAttribute } from "@shared/scene";
import {
  SceneDataCommandType,
  type SceneSourcePatch,
} from "@/workers/render/sceneProtocol";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import { TestInstant } from "../_support";

function event(
  id: string,
  timestamp: number,
  severity: IntelSeverity,
): EventPoint {
  return {
    id,
    type: Domain.Events,
    lat: 10,
    lon: 20,
    timestamp: new Date(timestamp).toISOString(),
    data: { headline: id, severity },
  };
}

describe("event scene source", () => {
  test("publishes patches and rebases through the shared scene path", async () => {
    let observedAt = TestInstant.EventSceneNow;
    let entities = [
      event("event-a", observedAt, IntelSeverity.Concern),
    ];
    const scenePatches: SceneSourcePatch[] = [];
    const binding = eventSceneBinding((command) => {
      if (command.type === SceneDataCommandType.SourcePatch) {
        scenePatches.push(command);
      }
    });
    const source = new EventSource({
      fetchSnapshot: async () => ({
        completeness: SourceCompleteness.Partial,
        entities,
        observedAt,
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
    observedAt += 1;
    entities = [
      event("event-b", observedAt, IntelSeverity.Crisis),
    ];
    await source.refresh();
    source.publishRebase();

    expect(scenePatches).toHaveLength(3);
    expect(scenePatches[0]?.kind).toBe(DatasetPatchKind.Rebase);
    expect(scenePatches[0]?.source).toBe(Domain.Events);
    expect(scenePatches[0]?.positions).toBeInstanceOf(Float64Array);
    expect(
      scenePatches[0]?.attributes[EventSceneAttribute.Severity],
    ).toBe(IntelSeverity.Concern);
    expect(scenePatches[1]?.kind).toBe(DatasetPatchKind.Patch);
    expect(scenePatches[1]?.entityIds).toEqual(["event-b"]);
    expect(scenePatches[2]?.kind).toBe(DatasetPatchKind.Rebase);
    expect(scenePatches[2]?.entityIds).toEqual([
      "event-a",
      "event-b",
    ]);

    observedAt =
      TestInstant.EventSceneNow + eventWindowDurationMs() + 2;
    entities = [];
    await source.refresh();

    expect(scenePatches[3]?.kind).toBe(DatasetPatchKind.Patch);
    expect(Array.from(scenePatches[3]?.deletedHandles ?? [])).toEqual([
      1,
      2,
    ]);
  });
});
