import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { TestInstant } from "../_support";
import {
  recordTrailPositions,
  type TrailEntry,
  type TrailObservation,
} from "@/lib/geo/trails/trailStore";

function ship(index: number): TrailObservation {
  return {
    id: `S${index}`,
    lat: (index % 90) - 45,
    lon: (index % 180) - 90,
    observedAt: TestInstant.TrailNow,
    heading: 0,
    speedMps: 5,
  };
}

describe("trail source ownership", () => {
  test("a ship batch cannot refresh or prune an aircraft trail", () => {
    const trails = new Map<string, TrailEntry>();
    recordTrailPositions(
      trails,
      Domain.Aircraft,
      [{
        id: "Aplane",
        lat: 40,
        lon: -74,
        observedAt: TestInstant.TrailNow,
        heading: 90,
        speedMps: 250,
      }],
      TestInstant.TrailNow,
    );

    const ships = Array.from({ length: 10_050 }, (_, index) => ship(index));
    recordTrailPositions(
      trails,
      Domain.Ships,
      ships,
      TestInstant.TrailNow + 1,
    );

    expect(trails.get("Aplane")?.lastSeen).toBe(
      TestInstant.TrailNow,
    );
    expect(trails.get("Aplane")?.points).toHaveLength(1);
  });
});
