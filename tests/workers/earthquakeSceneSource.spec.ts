import { describe, expect, test } from "bun:test";
import {
  EARTHQUAKE_FEED,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import {
  PointSourceCacheSchema,
  type PointSourceCacheSnapshot,
} from "@/workers/data/sourceRuntime";
import {
  earthquakeSceneBinding,
  EarthquakeSource,
} from "@/workers/data/sources/earthquakes";
import { EarthquakeSceneAttribute } from "@shared/scene";
import {
  SceneDataCommandType,
  type SceneSourcePatch,
  type SceneSourceSearch,
} from "@/workers/render/sceneProtocol";
import { Domain } from "@shared/domain/identity";
import { SourceStatus } from "@shared/domain/sourceStatus";
import { MS_PER_DAY } from "@shared/time";
enum EarthquakeFeedFixture {
  Count = 20_000,
  MagnitudeModulus = 8,
}

enum EarthquakeTestError {
  Offline = "offline",
}

enum EarthquakeTestInstant {
  Cache = 1_000,
  FeedStart = 1_700_000_000_000,
  SceneNow = 1_750_000_000_000,
}

function point(
  id: string,
  longitude: number,
  latitude: number,
  magnitude: number,
  timestamp = "2026-07-21T12:00:00.000Z",
): EarthquakePoint {
  return {
    id,
    type: Domain.Quakes,
    lon: longitude,
    lat: latitude,
    timestamp,
    data: { magnitude },
  };
}

describe("earthquake scene source", () => {
  test("validates the complete feed without truncation", async () => {
    const features = Array.from(
      { length: EarthquakeFeedFixture.Count },
      (_, index) => ({
        id: String(index),
        properties: {
          mag: index % EarthquakeFeedFixture.MagnitudeModulus,
          place: `event-${index}`,
          time: EarthquakeTestInstant.FeedStart + index,
          felt: null,
          tsunami: 0,
          alert: null,
          sig: index,
          magType: "mw",
          type: "earthquake",
          status: "reviewed",
          url: `https://example.test/${index}`,
        },
        geometry: {
          coordinates: [
            (index % 360) - 180,
            (index % 180) - 90,
            10,
          ],
        },
      }),
    );

    const snapshot = await EARTHQUAKE_FEED.fetchSnapshot(
      Date.now,
      async () => Response.json({ features }),
    );
    const points = snapshot.entities;

    expect(points).toHaveLength(EarthquakeFeedFixture.Count);
    expect(points.at(-1)?.id).toBe(
      `Q${EarthquakeFeedFixture.Count - 1}`,
    );
  });

  test("publishes incremental scene patches, search handles, and reconnect", async () => {
    let entities = [point("Qone", 0, 0, 2)];
    let observedAt = EarthquakeTestInstant.SceneNow;
    const patches: SceneSourcePatch[] = [];
    const searches: SceneSourceSearch[] = [];
    const binding = earthquakeSceneBinding((command) => {
      if (command.type === SceneDataCommandType.SourcePatch) {
        patches.push(command);
      } else {
        searches.push(command);
      }
    });
    const source = new EarthquakeSource({
      fetchPoints: async () => entities,
      now: () => observedAt,
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
    binding.publishSearch(["Qone"], 1, true);

    observedAt += 1;
    entities = [point("Qtwo", 90, 0, 5)];
    await source.refresh();
    source.publishRebase();

    expect(patches).toHaveLength(3);
    expect(patches[0]?.source).toBe(Domain.Earthquake);
    expect(Array.from(patches[0]?.positions ?? [])).toEqual([
      0,
      0,
    ]);
    expect(
      patches[0]?.attributes[EarthquakeSceneAttribute.Magnitude],
    ).toBe(2);
    expect(Array.from(patches[0]?.timestamps ?? [])).toEqual([
      Date.parse("2026-07-21T12:00:00.000Z"),
    ]);
    expect(Array.from(searches[0]?.handles ?? [])).toEqual([1]);
    expect(Array.from(patches[1]?.deletedHandles ?? [])).toEqual([
      1,
    ]);
    expect(patches[2]?.entityIds).toEqual(["Qtwo"]);
  });

  test("hydrates cache, replaces it, and accepts a complete empty snapshot", async () => {
    const cached = point("Qcached", -80, 30, 2);
    const live = point("Qlive", -81, 31, 4);
    const snapshots: DataWorkerSourceSnapshot[] = [];
    const patches: SceneSourcePatch[] = [];
    const persisted: Array<
      PointSourceCacheSnapshot<EarthquakePoint>
    > = [];
    let fetchCount = 0;
    let currentTime = EarthquakeTestInstant.SceneNow;
    const binding = earthquakeSceneBinding((command) => {
      if (command.type === SceneDataCommandType.SourcePatch) {
        patches.push(command);
      }
    });
    const source = new EarthquakeSource({
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
        timestamp: EarthquakeTestInstant.Cache,
        version: 1,
        entities: [cached],
      }),
      deleteCache: () => undefined,
      persistCache: (_key, snapshot) => {
        persisted.push(
          snapshot as PointSourceCacheSnapshot<EarthquakePoint>,
        );
      },
      publishStatus: (snapshot) => snapshots.push(snapshot),
      publishPatch: (patch) => binding.publish(patch),
    });

    await source.hydrate();
    await source.start();

    expect(source.values()).toEqual([live]);
    expect(source.get("Qlive")).toEqual(live);
    expect(snapshots.at(-1)?.status).toBe(SourceStatus.Live);

    currentTime += MS_PER_DAY;
    await source.refresh();

    expect(source.values()).toEqual([]);
    expect(source.get("Qlive")).toBeNull();
    expect(Array.from(patches.at(-1)?.deletedHandles ?? [])).toEqual([
      2,
    ]);
    expect(snapshots.at(-1)?.status).toBe(SourceStatus.Empty);
    expect(persisted.at(-1)?.entities).toEqual([]);
  });

  test("retains an old cached snapshot when refresh is unavailable", async () => {
    const cached = point("Qcached", -80, 30, 2);
    const snapshots: DataWorkerSourceSnapshot[] = [];
    const source = new EarthquakeSource({
      fetchPoints: async () => {
        throw new Error(EarthquakeTestError.Offline);
      },
      now: () =>
        EarthquakeTestInstant.Cache + 8 * MS_PER_DAY,
      schedule: () => () => undefined,
    });
    source.attach({
      readCache: async () => ({
        schema: PointSourceCacheSchema.Current,
        timestamp: EarthquakeTestInstant.Cache,
        version: 1,
        entities: [cached],
      }),
      persistCache: () => undefined,
      deleteCache: () => undefined,
      publishStatus: (snapshot) => snapshots.push(snapshot),
      publishPatch: () => undefined,
    });

    await source.hydrate();
    await source.start();

    expect(source.values()).toEqual([cached]);
    expect(snapshots.at(-1)?.status).toBe(SourceStatus.Cached);
    expect(snapshots.at(-1)?.error).toBe(
      EarthquakeTestError.Offline,
    );
  });
});
