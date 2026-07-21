import { describe, expect, test } from "bun:test";
import {
  EARTHQUAKE_SOURCE_POLICY,
  parseEarthquakeFeed,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import { packEarthquakeRenderData } from "@/workers/data/earthquakeRenderData";
import { createEarthquakeSourceOwner } from "@/workers/data/earthquakeSourceOwner";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";

function point(
  id: string,
  longitude: number,
  latitude: number,
  magnitude: number,
  timestamp = "2026-07-21T12:00:00.000Z",
): EarthquakePoint {
  return {
    id,
    type: "quakes",
    lon: longitude,
    lat: latitude,
    timestamp,
    data: { magnitude },
  };
}

describe("earthquake worker dataset", () => {
  test("validates the complete feed without truncation", () => {
    const expectedCount = 20_000;
    const features = Array.from(
      { length: expectedCount },
      (_, index) => ({
        id: String(index),
        properties: {
          mag: index % 8,
          place: `event-${index}`,
          time: 1_700_000_000_000 + index,
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

    const points = parseEarthquakeFeed({ features });

    expect(points).toHaveLength(expectedCount);
    expect(points.at(-1)?.id).toBe(`Q${expectedCount - 1}`);
  });

  test("packs canonical positions and precomputed unit vectors", () => {
    const packed = packEarthquakeRenderData([
      point("Qone", 0, 0, 2),
      point("Qtwo", 90, 0, 5),
    ]);

    expect(packed.ids).toEqual(["Qone", "Qtwo"]);
    expect([...packed.positions]).toEqual([0, 0, 90, 0]);
    expect([...packed.magnitudes]).toEqual([2, 5]);
    expect(packed.unitVectors[0]).toBeCloseTo(1);
    expect(packed.unitVectors[1]).toBeCloseTo(0);
    expect(packed.unitVectors[2]).toBeCloseTo(0);
    expect(packed.unitVectors[3]).toBeCloseTo(0);
    expect(packed.unitVectors[4]).toBeCloseTo(0);
    expect(packed.unitVectors[5]).toBeCloseTo(-1);
  });

  test("hydrates cache, replaces it with live data, and accepts complete empty", async () => {
    const cached = point("Qcached", -80, 30, 2);
    const live = point("Qlive", -81, 31, 4);
    const snapshots: DataWorkerSourceSnapshot[] = [];
    const rebases: Array<readonly EarthquakePoint[]> = [];
    const persisted: Array<{
      timestamp: number;
      data: EarthquakePoint[];
    }> = [];
    let fetchCount = 0;
    let currentTime = 2_000;
    const owner = createEarthquakeSourceOwner({
      readCache: async () => ({
        timestamp: 1_000,
        data: [cached],
      }),
      persistCache: (snapshot) => {
        persisted.push(snapshot);
      },
      fetchPoints: async () => {
        fetchCount++;
        return fetchCount === 1 ? [live] : [];
      },
      publish: (snapshot) => snapshots.push(snapshot),
      rebaseRender: (points) => rebases.push(points),
      now: () => currentTime,
      schedule: () => () => undefined,
    });

    await owner.start();

    expect(rebases[0]).toEqual([cached]);
    expect(owner.read()).toEqual([live]);
    expect(owner.find("Qlive")).toEqual(live);
    expect(snapshots.at(-1)?.status).toBe("live");

    currentTime += EARTHQUAKE_SOURCE_POLICY.pollIntervalMs;
    await owner.refresh();

    expect(owner.read()).toEqual([]);
    expect(owner.find("Qlive")).toBeNull();
    expect(rebases.at(-1)).toEqual([]);
    expect(snapshots.at(-1)?.status).toBe("empty");
    expect(persisted.at(-1)?.data).toEqual([]);
  });
});
