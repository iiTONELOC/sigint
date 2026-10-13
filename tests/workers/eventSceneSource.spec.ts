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

async function publishEvents(): Promise<SceneSourcePatch[]> {
  let observedAt = TestInstant.EventSceneNow;
  let entities = [event("event-a", observedAt, IntelSeverity.Concern)];
  const scenePatches: SceneSourcePatch[] = [];
  const binding = eventSceneBinding((command) => {
    if (command.type === SceneDataCommandType.SourcePatch) scenePatches.push(command);
  });
  const source = new EventSource({
    fetchSnapshot: async () => ({ completeness: SourceCompleteness.Partial, entities, observedAt }),
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
  entities = [event("event-b", observedAt, IntelSeverity.Crisis)];
  await source.refresh();
  source.publishRebase();
  observedAt = TestInstant.EventSceneNow + eventWindowDurationMs() + 2;
  entities = [];
  await source.refresh();
  return scenePatches;
}

describe("event scene source", () => {
  test("publishes a rebase, a patch and a rebase for two events", async () => {
    const patches = await publishEvents();

    expect(patches.slice(0, 3).map((patch) => patch.kind)).toEqual([DatasetPatchKind.Rebase, DatasetPatchKind.Patch, DatasetPatchKind.Rebase]);
    expect(patches[0]?.source).toBe(Domain.Events);
    expect(patches[0]?.positions).toBeInstanceOf(Float64Array);
    expect(patches[0]?.attributes[EventSceneAttribute.Severity]).toBe(IntelSeverity.Concern);
    expect(patches[1]?.entityIds).toEqual(["event-b"]);
    expect(patches[2]?.entityIds).toEqual(["event-a", "event-b"]);
  });

  test("deletes both events once the window has passed", async () => {
    const patches = await publishEvents();

    expect(patches).toHaveLength(4);
    expect(patches[3]?.kind).toBe(DatasetPatchKind.Patch);
    expect(Array.from(patches[3]?.deletedHandles ?? [])).toEqual([1, 2]);
  });
});
