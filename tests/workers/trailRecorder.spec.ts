import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  createTrailRecorder,
} from "@/workers/data/trails/trailRecorder";

describe("trail recorder publication", () => {
  test("notifies the selected-overlay owner after a source changes", () => {
    const sources: Domain[] = [];
    const recorder = createTrailRecorder({
      readCache: async () => null,
      persistCache: () => undefined,
      now: () => 100,
    });
    recorder.subscribe((source) => {
      sources.push(source);
    });

    recorder.observe(Domain.Aircraft, [{
      id: "aircraft-a",
      lat: 40,
      lon: -74,
      observedAt: 100,
    }]);

    expect(sources).toEqual([Domain.Aircraft]);
  });

  test("notifies after cached history hydrates", async () => {
    const sources: Domain[] = [];
    const recorder = createTrailRecorder({
      readCache: async () => ({
        "aircraft-a": {
          type: Domain.Aircraft,
          points: [{
            lat: 40,
            lon: -74,
            ts: 100,
          }],
          lastSeen: 100,
          heading: 90,
          speedMps: 200,
        },
      }),
      persistCache: () => undefined,
      now: () => 100,
    });
    recorder.subscribe((source) => {
      sources.push(source);
    });

    await recorder.hydrate();

    expect(sources).toEqual([Domain.Aircraft]);
  });
});
