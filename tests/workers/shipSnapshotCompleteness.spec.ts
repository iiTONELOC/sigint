import { describe, expect, test } from "bun:test";
import { SourceCompleteness } from "@shared/source";
import { shipSnapshotCompleteness } from "@/workers/data/sources/ships";

describe("shipSnapshotCompleteness", () => {
  test("replaces the browser set with the server's set, even while the stream is reconnecting", () => {
    expect(shipSnapshotCompleteness({ vessels: [], vesselCount: 0, connected: false })).toBe(SourceCompleteness.Complete);
    expect(shipSnapshotCompleteness({ vessels: [], vesselCount: 0, connected: true })).toBe(SourceCompleteness.Complete);
  });

  test("only adds when the payload is missing vessels the server counted", () => {
    expect(shipSnapshotCompleteness({ vessels: [], vesselCount: 3, connected: true })).toBe(SourceCompleteness.Partial);
  });
});
