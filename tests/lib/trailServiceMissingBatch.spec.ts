import { describe, expect, test } from "bun:test";
import {
  recordTrailPositions,
  type TrailEntry,
  type TrailObservation,
} from "../../src/client/lib/geo/trailService";

const NOW = 1_000_000;

function ship(index: number): TrailObservation {
  return {
    id: `S${index}`,
    lat: (index % 90) - 45,
    lon: (index % 180) - 90,
    observedAt: NOW,
    heading: 0,
    speedMps: 5,
  };
}

describe("trail source ownership", () => {
  test("a ship batch cannot refresh or prune an aircraft trail", () => {
    const trails = new Map<string, TrailEntry>();
    recordTrailPositions(
      trails,
      "aircraft",
      [{
        id: "Aplane",
        lat: 40,
        lon: -74,
        observedAt: NOW,
        heading: 90,
        speedMps: 250,
      }],
      NOW,
    );

    const ships = Array.from({ length: 10_050 }, (_, index) => ship(index));
    recordTrailPositions(trails, "ships", ships, NOW + 1);

    expect(trails.get("Aplane")?.lastSeen).toBe(NOW);
    expect(trails.get("Aplane")?.points).toHaveLength(1);
  });
});
