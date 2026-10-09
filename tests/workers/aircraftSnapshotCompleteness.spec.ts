import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  SourceCompleteness,
  SourceFreshness,
  SourcePhase,
  type SourceState,
} from "@shared/source";
import { aircraftSnapshotCompleteness } from "@/workers/data/sources/aircraft";

function serverState(receivedAt: number | null, completeness: SourceCompleteness): SourceState {
  return {
    source: Domain.Aircraft,
    phase: SourcePhase.Degraded,
    freshness: SourceFreshness.Fresh,
    completeness,
    sequence: 1,
    observedAt: receivedAt,
    receivedAt,
    expiresAt: null,
    successfulScopes: 1,
    failedScopes: 1,
    totalScopes: 2,
    error: null,
  };
}

describe("aircraftSnapshotCompleteness", () => {
  test("replaces the browser set once the server has received data, even mid-sweep", () => {
    expect(aircraftSnapshotCompleteness(serverState(1_000, SourceCompleteness.Partial))).toBe(SourceCompleteness.Complete);
    expect(aircraftSnapshotCompleteness(serverState(1_000, SourceCompleteness.Unknown))).toBe(SourceCompleteness.Complete);
  });

  test("only adds aircraft before the server has received any data", () => {
    expect(aircraftSnapshotCompleteness(serverState(null, SourceCompleteness.Unknown))).toBe(SourceCompleteness.Partial);
  });
});
