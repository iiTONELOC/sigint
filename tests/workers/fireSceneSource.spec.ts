import { describe, expect, test } from "bun:test";
import {
  FireConfidenceLevel,
  fireFetchError,
  parseFireFeed,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import {
  PointSourceCacheSchema,
  type PointSourceCacheSnapshot,
} from "@/workers/data/sourceRuntime";
import {
  FireHttpStatus,
  FireSceneBinding,
  FireSource,
} from "@/workers/data/sources/fires";
import {
  FireSceneAttribute,
} from "@/workers/render/scene/fireSchema";
import {
  SceneDataCommandType,
  type SceneSourcePatch,
  type SceneSourceSearch,
} from "@/workers/render/sceneProtocol";
import { Domain } from "@shared/domain/identity";
import { SourceStatus } from "@shared/domain/sourceStatus";
import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_DAY,
} from "@shared/time";

enum FireFeedFixture {
  Count = 20_000,
}

enum FireTestInstant {
  Cache = 1_000,
  SceneNow = 1_750_000_000_000,
}

function point(
  id: string,
  longitude: number,
  latitude: number,
  power: number,
  confidence = "nominal",
  timestamp = "2026-07-21T12:00:00.000Z",
): FirePoint {
  return {
    id,
    type: Domain.Fires,
    lon: longitude,
    lat: latitude,
    timestamp,
    data: { frp: power, confidence, satellite: "N" },
  };
}

describe("fire scene source", () => {
  test("validates the complete feed without truncation", () => {
    const minutesPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR;
    const data = Array.from(
      { length: FireFeedFixture.Count },
      (_, index) => {
        const minuteOfDay = index % minutesPerDay;
        const hour = Math.floor(
          minuteOfDay / MINUTES_PER_HOUR,
        );
        const minute = minuteOfDay % MINUTES_PER_HOUR;
        return {
          lat: (index % 170) - 85 + 0.01,
          lon: (index % 350) - 175 + 0.01,
          brightness: 320,
          acqDate: "2026-07-21",
          acqTime: String(hour * 100 + minute).padStart(4, "0"),
          satellite: `N${index}`,
          confidence: "nominal",
          frp: index,
        };
      },
    );

    const points = parseFireFeed({ data });

    expect(points).toHaveLength(FireFeedFixture.Count);
    expect(points.at(-1)?.data.frp).toBe(
      FireFeedFixture.Count - 1,
    );
  });

  test("collapses a repeated FIRMS identity", () => {
    const repeated = {
      lat: -14.4192,
      lon: 34.9362,
      acqDate: "2026-07-28",
      acqTime: "1041",
      satellite: "N20",
      confidence: "nominal",
      frp: 12,
    };
    const distinct = { ...repeated, lat: -15.5, frp: 7 };

    const points = parseFireFeed({
      data: [repeated, { ...repeated, frp: 34 }, distinct],
    });

    expect(points).toHaveLength(2);
    expect(new Set(points.map((item) => item.id)).size).toBe(2);
    expect(
      points.find((item) => item.lat === repeated.lat)?.data.frp,
    ).toBe(34);
  });

  test("uses stable source identity and observation time", () => {
    const input = {
      lat: 30,
      lon: -80,
      acqDate: "2026-07-21",
      acqTime: "1430",
      satellite: "N",
      confidence: "high",
      frp: 50,
    };
    const first = parseFireFeed({ data: [input] });
    const second = parseFireFeed({ data: [input] });

    expect(first[0]?.id).toBe(second[0]?.id);
    expect(first[0]?.timestamp).toBe(
      "2026-07-21T14:30:00.000Z",
    );
  });

  test("publishes scene patches, search handles, and reconnect", async () => {
    let entities = [point("FI-one", 0, 0, 10, "nominal")];
    let observedAt = FireTestInstant.SceneNow;
    const patches: SceneSourcePatch[] = [];
    const searches: SceneSourceSearch[] = [];
    const binding = new FireSceneBinding((command) => {
      if (command.type === SceneDataCommandType.SourcePatch) {
        patches.push(command);
      } else {
        searches.push(command);
      }
    });
    const source = new FireSource({
      fetchPoints: async () => entities,
      now: () => observedAt,
    });
    source.attach({
      readCache: async () => null,
      persistCache: () => undefined,
      publishStatus: () => undefined,
      publishPatch: (patch) => binding.publish(patch),
    });

    await source.refresh();
    binding.publishSearch(["FI-one"], 1, true);

    observedAt += 1;
    entities = [point("FI-two", 90, 0, 30, "high")];
    await source.refresh();
    source.publishRebase();

    expect(patches).toHaveLength(3);
    expect(patches[0]?.source).toBe(Domain.Fire);
    expect(Array.from(patches[0]?.positions ?? [])).toEqual([
      0,
      0,
    ]);
    expect(
      patches[0]?.attributes[
        FireSceneAttribute.RadiativePower
      ],
    ).toBe(10);
    expect(
      patches[0]?.attributes[FireSceneAttribute.Confidence],
    ).toBe(FireConfidenceLevel.Nominal);
    expect(Array.from(searches[0]?.handles ?? [])).toEqual([1]);
    expect(Array.from(patches[1]?.deletedHandles ?? [])).toEqual([
      1,
    ]);
    expect(patches[2]?.entityIds).toEqual(["FI-two"]);
  });

  test("hydrates, replaces, and accepts a complete empty snapshot", async () => {
    const cached = point("FI-cached", -80, 30, 10);
    const live = point("FI-live", -81, 31, 40);
    const snapshots: DataWorkerSourceSnapshot[] = [];
    const patches: SceneSourcePatch[] = [];
    const persisted: Array<PointSourceCacheSnapshot<FirePoint>> = [];
    let fetchCount = 0;
    let currentTime = FireTestInstant.SceneNow;
    const binding = new FireSceneBinding((command) => {
      if (command.type === SceneDataCommandType.SourcePatch) {
        patches.push(command);
      }
    });
    const source = new FireSource({
      fetchPoints: async () => {
        fetchCount += 1;
        return fetchCount === 1 ? [live] : [];
      },
      now: () => currentTime,
      schedule: () => () => undefined,
    });
    source.attach({
      readCache: async () => ({
        schema: PointSourceCacheSchema.Current,
        timestamp: FireTestInstant.Cache,
        version: 1,
        entities: [cached],
      }),
      persistCache: (_key, snapshot) => {
        persisted.push(
          snapshot as PointSourceCacheSnapshot<FirePoint>,
        );
      },
      publishStatus: (snapshot) => snapshots.push(snapshot),
      publishPatch: (patch) => binding.publish(patch),
    });

    await source.hydrate();
    await source.start();

    expect(source.values()).toEqual([live]);
    expect(source.get("FI-live")).toEqual(live);
    expect(snapshots.at(-1)?.status).toBe(SourceStatus.Live);

    currentTime += MS_PER_DAY;
    await source.refresh();

    expect(source.values()).toEqual([]);
    expect(source.get("FI-live")).toBeNull();
    expect(Array.from(patches.at(-1)?.deletedHandles ?? [])).toEqual([
      2,
    ]);
    expect(snapshots.at(-1)?.status).toBe(SourceStatus.Empty);
    expect(persisted.at(-1)?.entities).toEqual([]);
  });

  test("retains cached data during upstream unavailability", async () => {
    const cached = point("FI-cached", -80, 30, 10);
    const snapshots: DataWorkerSourceSnapshot[] = [];
    const source = new FireSource({
      fetchPoints: async () => {
        throw fireFetchError(FireHttpStatus.ServiceUnavailable);
      },
      now: () => FireTestInstant.SceneNow,
      schedule: () => () => undefined,
    });
    source.attach({
      readCache: async () => ({
        schema: PointSourceCacheSchema.Current,
        timestamp: FireTestInstant.Cache,
        version: 1,
        entities: [cached],
      }),
      persistCache: () => undefined,
      publishStatus: (snapshot) => snapshots.push(snapshot),
      publishPatch: () => undefined,
    });

    await source.hydrate();
    await source.start();

    expect(source.values()).toEqual([cached]);
    expect(snapshots.at(-1)?.status).toBe(SourceStatus.Cached);
  });

  test("reports unavailable on a cold service failure", async () => {
    const snapshots: DataWorkerSourceSnapshot[] = [];
    const source = new FireSource({
      fetchPoints: async () => {
        throw fireFetchError(FireHttpStatus.ServiceUnavailable);
      },
      schedule: () => () => undefined,
    });
    source.attach({
      readCache: async () => null,
      persistCache: () => undefined,
      publishStatus: (snapshot) => snapshots.push(snapshot),
      publishPatch: () => undefined,
    });

    await source.hydrate();
    await source.start();

    expect(source.values()).toEqual([]);
    expect(snapshots.at(-1)?.status).toBe(
      SourceStatus.Unavailable,
    );
  });
});
