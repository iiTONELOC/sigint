import { describe, expect, test } from "bun:test";
import type { EventPoint } from "@/features/intel/events/data/codec";
import { EventSeverity } from "@/features/intel/events/types";
import { EventSceneBinding } from "@/workers/data/render-codecs/eventSceneBinding";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  EventSource,
  eventWindowDurationMs,
} from "@/workers/data/sources/events";
import { EventSceneAttribute } from "@/workers/render/scene/eventSchema";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import { TestInstant } from "../_support";

function event(
  id: string,
  timestamp: number,
  severity: EventSeverity,
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
      event("event-a", observedAt, EventSeverity.Concern),
    ];
    const scenePatches: SceneSourcePatch[] = [];
    const binding = new EventSceneBinding((patch) => {
      scenePatches.push(patch);
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
      publishStatus: () => undefined,
      publishPatch: (patch) => {
        binding.publish(patch);
      },
    });

    await source.refresh();
    observedAt += 1;
    entities = [
      event("event-b", observedAt, EventSeverity.Crisis),
    ];
    await source.refresh();
    source.publishRebase();

    expect(scenePatches).toHaveLength(3);
    expect(scenePatches[0]?.kind).toBe(DatasetPatchKind.Rebase);
    expect(scenePatches[0]?.source).toBe(Domain.Events);
    expect(scenePatches[0]?.positions).toBeInstanceOf(Float64Array);
    expect(
      scenePatches[0]?.attributes[EventSceneAttribute.Severity],
    ).toBe(EventSeverity.Concern);
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
