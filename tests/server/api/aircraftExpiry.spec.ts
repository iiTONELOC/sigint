import { afterEach, describe, expect, test } from "bun:test";
import { SourceErrorCode } from "@shared/source";
import {
  AircraftSourcePolicy,
  AircraftTileResultKind,
  createSweepState,
  getAircraftCache,
  ingestTile,
  pruneExpiredAircraft,
  runSweep,
  __resetAircraftCacheForTests,
  type AircraftTileResult,
} from "../../../src/server/api/aircraftCache";

const noSleep = async () => undefined;
const RECEIVED_AT = 1_000_000_000;
const EXPIRED_AT = RECEIVED_AT - AircraftSourcePolicy.MaxStaleMs - 1;
const seenTile = async (): Promise<AircraftTileResult> => ({
  kind: AircraftTileResultKind.Complete,
  records: [{ hex: "abc123", seen_pos: 0 }],
});
const failedTile = async (): Promise<AircraftTileResult> => ({
  kind: AircraftTileResultKind.Failed,
  error: { code: SourceErrorCode.NetworkError, message: "down" },
});

afterEach(() => {
  __resetAircraftCacheForTests();
});

describe("pruneExpiredAircraft", () => {
  test("keeps aircraft observed within the stale limit and drops older ones", () => {
    const state = createSweepState();
    ingestTile(state, [{ hex: "fresh", seen_pos: 1 }], RECEIVED_AT);
    state.completed.set("expired", { hex: "expired", observedAt: EXPIRED_AT });
    pruneExpiredAircraft(state, RECEIVED_AT);
    expect([...state.completed.keys()]).toEqual(["fresh"]);
  });
});

describe("getAircraftCache", () => {
  test("serves an aircraft until it passes the stale limit, then drops it", async () => {
    await runSweep(seenTile, noSleep);
    const now = Date.now();
    expect(getAircraftCache(now).aircraftCount).toBe(1);
    const later = getAircraftCache(now + AircraftSourcePolicy.MaxStaleMs + 1_000);
    expect(later.aircraftCount).toBe(0);
    expect(later.body).toEqual({ ac: [] });
  });

  test("keeps recent aircraft through a sweep where every tile fails", async () => {
    await runSweep(seenTile, noSleep);
    await runSweep(failedTile, noSleep);
    expect(getAircraftCache().aircraftCount).toBe(1);
  });
});
