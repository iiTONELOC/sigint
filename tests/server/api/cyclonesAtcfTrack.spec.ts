import { describe, expect, it } from "bun:test";
import { parseAtcfTrack } from "../../../src/server/api/cyclonesAtcfCache";

describe("parseAtcfTrack", () => {
  it("retains observed central pressure", () => {
    const track = parseAtcfTrack(
      "AL, 02, 2026072006, 00, BEST, 0, 286N, 0860W, 35, 1004, TS",
    );

    expect(track).toEqual([
      {
        lat: 28.6,
        lon: -86,
        validTime: "2026072006",
        vmaxKt: 35,
        minPressureMb: 1004,
      },
    ]);
  });
});
