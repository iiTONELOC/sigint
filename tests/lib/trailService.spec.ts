import { describe, expect, test } from "bun:test";
import {
  TRAIL_POLICY,
  recordTrailPositions,
  type TrailEntry,
  type TrailObservation,
  type TrackType,
} from "../../src/client/lib/geo/trailService";

const NOW = 1_000_000;

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
  source: TrackType,
  items: readonly TrailObservation[],
  now: number,
): boolean {
  return recordTrailPositions(trails, source, items, now);
}

describe("recordTrailPositions", () => {
  test("filters movement below the aircraft threshold", () => {
    const trails = new Map<string, TrailEntry>();
    record(trails, "aircraft", [observation("A1", NOW)], NOW);
    record(
      trails,
      "aircraft",
      [observation("A1", NOW + 1, 40.0005)],
      NOW + 1,
    );

    expect(trails.get("A1")?.points).toHaveLength(1);
    expect(trails.get("A1")?.lastSeen).toBe(NOW + 1);
  });

  test("records movement above the aircraft threshold", () => {
    const trails = new Map<string, TrailEntry>();
    record(trails, "aircraft", [observation("A1", NOW)], NOW);
    record(
      trails,
      "aircraft",
      [observation("A1", NOW + 1, 40.002)],
      NOW + 1,
    );

    expect(trails.get("A1")?.points).toHaveLength(2);
  });

  test("uses the production point cap", () => {
    const trails = new Map<string, TrailEntry>();
    const count = TRAIL_POLICY.aircraft.maxTrailPoints + 30;
    const observations = Array.from({ length: count }, (_, index) =>
      observation(
        "A1",
        NOW + index,
        40 + index * TRAIL_POLICY.aircraft.minMoveDeg * 2,
      ),
    );

    record(trails, "aircraft", observations, NOW + count);

    expect(trails.get("A1")?.points).toHaveLength(
      TRAIL_POLICY.aircraft.maxTrailPoints,
    );
    expect(trails.get("A1")?.points.at(-1)?.ts).toBe(
      NOW + count - 1,
    );
  });

  test("ignores out-of-order observations", () => {
    const trails = new Map<string, TrailEntry>();
    record(
      trails,
      "aircraft",
      [observation("A1", NOW + 10, 41)],
      NOW + 10,
    );
    const changed = record(
      trails,
      "aircraft",
      [observation("A1", NOW + 5, 42)],
      NOW + 10,
    );

    expect(changed).toBe(false);
    expect(trails.get("A1")?.points.at(-1)?.lat).toBe(41);
    expect(trails.get("A1")?.lastSeen).toBe(NOW + 10);
  });

  test("does not create a trail from an already stale observation", () => {
    const trails = new Map<string, TrailEntry>();
    const changed = record(
      trails,
      "aircraft",
      [observation("A1", NOW)],
      NOW + TRAIL_POLICY.aircraft.staleMs + 1,
    );

    expect(changed).toBe(false);
    expect(trails.has("A1")).toBe(false);
  });

  test("an empty source batch prunes only that source", () => {
    const trails = new Map<string, TrailEntry>();
    record(trails, "aircraft", [observation("A1", NOW)], NOW);
    record(trails, "ships", [observation("S1", NOW)], NOW);

    record(
      trails,
      "aircraft",
      [],
      NOW + TRAIL_POLICY.aircraft.staleMs + 1,
    );

    expect(trails.has("A1")).toBe(false);
    expect(trails.has("S1")).toBe(true);
  });

  test("clamps future source time to the receiving clock", () => {
    const trails = new Map<string, TrailEntry>();
    record(
      trails,
      "aircraft",
      [observation("A1", NOW + 60_000)],
      NOW,
    );

    expect(trails.get("A1")?.lastSeen).toBe(NOW);
    expect(trails.get("A1")?.points[0]?.ts).toBe(NOW);
  });
});
