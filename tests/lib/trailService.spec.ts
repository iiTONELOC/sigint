import { describe, expect, test } from "bun:test";
import { TestInstant } from "../_support";
import { Domain } from "../../src/shared/domain/identity";
import { MS_PER_MINUTE } from "../../src/shared/time";
import {
  TRAIL_POLICY,
  recordTrailPositions,
  type TrailEntry,
  type TrailObservation,
  type TrackSource,
} from "../../src/client/lib/geo/trails/trailStore";

function observation(
  id: string,
  observedAt: number,
  lat = 40,
  lon = -74,
): TrailObservation {
  return {
    id,
    lat,
    lon,
    observedAt,
    heading: 90,
    speedMps: 250,
  };
}

function record(
  trails: Map<string, TrailEntry>,
  source: TrackSource,
  items: readonly TrailObservation[],
  now: number,
): boolean {
  return recordTrailPositions(trails, source, items, now);
}

describe("recordTrailPositions", () => {
  test("filters movement below the aircraft threshold", () => {
    const trails = new Map<string, TrailEntry>();
    record(
      trails,
      Domain.Aircraft,
      [observation("A1", TestInstant.TrailNow)],
      TestInstant.TrailNow,
    );
    record(
      trails,
      Domain.Aircraft,
      [observation("A1", TestInstant.TrailNow + 1, 40.0005)],
      TestInstant.TrailNow + 1,
    );

    expect(trails.get("A1")?.points).toHaveLength(1);
    expect(trails.get("A1")?.lastSeen).toBe(
      TestInstant.TrailNow + 1,
    );
  });

  test("records movement above the aircraft threshold", () => {
    const trails = new Map<string, TrailEntry>();
    record(
      trails,
      Domain.Aircraft,
      [observation("A1", TestInstant.TrailNow)],
      TestInstant.TrailNow,
    );
    record(
      trails,
      Domain.Aircraft,
      [observation("A1", TestInstant.TrailNow + 1, 40.002)],
      TestInstant.TrailNow + 1,
    );

    expect(trails.get("A1")?.points).toHaveLength(2);
  });

  test("uses the production point cap", () => {
    const trails = new Map<string, TrailEntry>();
    const count =
      TRAIL_POLICY[Domain.Aircraft].maxTrailPoints + 30;
    const observations = Array.from({ length: count }, (_, index) =>
      observation(
        "A1",
        TestInstant.TrailNow + index,
        40 +
          index *
            TRAIL_POLICY[Domain.Aircraft].minMoveDeg *
            2,
      ),
    );

    record(
      trails,
      Domain.Aircraft,
      observations,
      TestInstant.TrailNow + count,
    );

    expect(trails.get("A1")?.points).toHaveLength(
      TRAIL_POLICY[Domain.Aircraft].maxTrailPoints,
    );
    expect(trails.get("A1")?.points.at(-1)?.ts).toBe(
      TestInstant.TrailNow + count - 1,
    );
  });

  test("ignores out-of-order observations", () => {
    const trails = new Map<string, TrailEntry>();
    record(
      trails,
      Domain.Aircraft,
      [observation("A1", TestInstant.TrailNow + 10, 41)],
      TestInstant.TrailNow + 10,
    );
    const changed = record(
      trails,
      Domain.Aircraft,
      [observation("A1", TestInstant.TrailNow + 5, 42)],
      TestInstant.TrailNow + 10,
    );

    expect(changed).toBe(false);
    expect(trails.get("A1")?.points.at(-1)?.lat).toBe(41);
    expect(trails.get("A1")?.lastSeen).toBe(
      TestInstant.TrailNow + 10,
    );
  });

  test("does not create a trail from an already stale observation", () => {
    const trails = new Map<string, TrailEntry>();
    const changed = record(
      trails,
      Domain.Aircraft,
      [observation("A1", TestInstant.TrailNow)],
      TestInstant.TrailNow +
        TRAIL_POLICY[Domain.Aircraft].staleMs +
        1,
    );

    expect(changed).toBe(false);
    expect(trails.has("A1")).toBe(false);
  });

  test("an empty source batch prunes only that source", () => {
    const trails = new Map<string, TrailEntry>();
    record(
      trails,
      Domain.Aircraft,
      [observation("A1", TestInstant.TrailNow)],
      TestInstant.TrailNow,
    );
    record(
      trails,
      Domain.Ships,
      [observation("S1", TestInstant.TrailNow)],
      TestInstant.TrailNow,
    );

    record(
      trails,
      Domain.Aircraft,
      [],
      TestInstant.TrailNow +
        TRAIL_POLICY[Domain.Aircraft].staleMs +
        1,
    );

    expect(trails.has("A1")).toBe(false);
    expect(trails.has("S1")).toBe(true);
  });

  test("clamps future source time to the receiving clock", () => {
    const trails = new Map<string, TrailEntry>();
    record(
      trails,
      Domain.Aircraft,
      [observation("A1", TestInstant.TrailNow + MS_PER_MINUTE)],
      TestInstant.TrailNow,
    );

    expect(trails.get("A1")?.lastSeen).toBe(TestInstant.TrailNow);
    expect(trails.get("A1")?.points[0]?.ts).toBe(
      TestInstant.TrailNow,
    );
  });
});
