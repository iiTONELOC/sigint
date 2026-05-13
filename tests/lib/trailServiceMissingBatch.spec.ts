import { describe, test, expect } from "bun:test";
import {
  recordPositions,
  getTrail,
} from "../../src/client/lib/trailService";

type Item = {
  id: string;
  type: "aircraft" | "ships";
  lat: number;
  lon: number;
  heading?: number;
  speedMps?: number;
};

function aircraft(id: string, lat: number, lon: number): Item {
  return { id, type: "aircraft", lat, lon, heading: 90, speedMps: 250 };
}

function ship(i: number): Item {
  return {
    id: `S${i}`,
    type: "ships",
    lat: (i % 90) - 45,
    lon: (i % 180) - 90,
    heading: 0,
    speedMps: 5,
  };
}

describe("trailService — aircraft survives one missing batch even with many ships", () => {
  test("aircraft trail persists when omitted from a single batch alongside 10k+ ships", () => {
    const PLANE_ID = `A${Math.random().toString(36).slice(2, 8)}`;

    // Batch 1: plane + 10,050 ships. trails.size = 10,051 > any 10k cap.
    const batch1: Item[] = [aircraft(PLANE_ID, 40, -74)];
    for (let i = 0; i < 10_050; i++) batch1.push(ship(i));
    recordPositions(batch1);

    expect(getTrail(PLANE_ID).length).toBeGreaterThan(0);

    // Batch 2: same ships (each refreshed → newest lastSeen), plane omitted.
    const batch2: Item[] = [];
    for (let i = 0; i < 10_050; i++) batch2.push(ship(i));
    recordPositions(batch2);

    // The plane is well within its 8-miss / 32-min tolerance after one
    // omission. Its trail MUST still exist.
    expect(getTrail(PLANE_ID).length).toBeGreaterThan(0);
  });
});
