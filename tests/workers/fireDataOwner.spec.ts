import { describe, expect, test } from "bun:test";
import {
  FIRE_SOURCE_POLICY,
  parseFireFeed,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import { packFireRenderData } from "@/workers/data/fireRenderData";
import { createFireSourceOwner } from "@/workers/data/fireSourceOwner";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";

function point(
  id: string,
  longitude: number,
  latitude: number,
  frp: number,
  confidence = "nominal",
  timestamp = "2026-07-21T12:00:00.000Z",
): FirePoint {
  return {
    id,
    type: "fires",
    lon: longitude,
    lat: latitude,
    timestamp,
    data: { frp, confidence, satellite: "N" },
  };
}

describe("fire worker dataset", () => {
  test("validates the complete feed without truncation", () => {
    const expectedCount = 20_000;
    const data = Array.from({ length: expectedCount }, (_, index) => {
      const minuteOfDay = index % (24 * 60);
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
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
    });

    const points = parseFireFeed({ data });

    expect(points).toHaveLength(expectedCount);
    expect(points.at(-1)?.data.frp).toBe(expectedCount - 1);
  });

  test("uses stable source identity and source observation time", () => {
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
    expect(first[0]?.timestamp).toBe("2026-07-21T14:30:00.000Z");
  });

  test("packs canonical positions and precomputed unit vectors", () => {
    const packed = packFireRenderData([
      point("FI-one", 0, 0, 10, "nominal"),
      point("FI-two", 90, 0, 30, "high"),
    ]);

    expect(packed.ids).toEqual(["FI-one", "FI-two"]);
    expect([...packed.positions]).toEqual([0, 0, 90, 0]);
    expect([...packed.frp]).toEqual([10, 30]);
    expect([...packed.confidences]).toEqual([1, 2]);
    expect(packed.unitVectors[0]).toBeCloseTo(1);
    expect(packed.unitVectors[3]).toBeCloseTo(0);
    expect(packed.unitVectors[5]).toBeCloseTo(-1);
  });

  test("hydrates cache, replaces it with live data, and accepts complete empty", async () => {
    const cached = point("FI-cached", -80, 30, 10);
    const live = point("FI-live", -81, 31, 40);
    const snapshots: DataWorkerSourceSnapshot[] = [];
    const rebases: Array<readonly FirePoint[]> = [];
    const persisted: Array<{ timestamp: number; data: FirePoint[] }> = [];
    let fetchCount = 0;
    let currentTime = 2_000;
    const owner = createFireSourceOwner({
      readCache: async () => ({ timestamp: 1_000, data: [cached] }),
      persistCache: (snapshot) => persisted.push(snapshot),
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
    expect(owner.find("FI-live")).toEqual(live);
    expect(snapshots.at(-1)?.status).toBe("live");

    currentTime += FIRE_SOURCE_POLICY.pollIntervalMs;
    await owner.refresh();

    expect(owner.read()).toEqual([]);
    expect(owner.find("FI-live")).toBeNull();
    expect(rebases.at(-1)).toEqual([]);
    expect(snapshots.at(-1)?.status).toBe("empty");
    expect(persisted.at(-1)?.data).toEqual([]);
  });

  test("retains cached data and exposes upstream unavailability", async () => {
    const cached = point("FI-cached", -80, 30, 10);
    const snapshots: DataWorkerSourceSnapshot[] = [];
    const owner = createFireSourceOwner({
      readCache: async () => ({ timestamp: 1_000, data: [cached] }),
      persistCache: () => undefined,
      fetchPoints: async () => {
        throw new Error("Fires API error: 503");
      },
      publish: (snapshot) => snapshots.push(snapshot),
      rebaseRender: () => undefined,
      now: () => 2_000,
      schedule: () => () => undefined,
    });

    await owner.start();

    expect(owner.read()).toEqual([cached]);
    expect(snapshots.at(-1)?.status).toBe("cached");
  });

  test("reports unavailable on a cold 503 response", async () => {
    const snapshots: DataWorkerSourceSnapshot[] = [];
    const owner = createFireSourceOwner({
      readCache: async () => null,
      persistCache: () => undefined,
      fetchPoints: async () => {
        throw new Error("Fires API error: 503");
      },
      publish: (snapshot) => snapshots.push(snapshot),
      rebaseRender: () => undefined,
      schedule: () => () => undefined,
    });

    await owner.start();

    expect(owner.read()).toEqual([]);
    expect(snapshots.at(-1)?.status).toBe("unavailable");
  });
});
