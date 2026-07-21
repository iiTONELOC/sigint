import { describe, expect, test } from "bun:test";
import {
  decodeShipPoints,
  parseShipServerPayload,
} from "@/features/tracking/ships/data/codec";

const vessel = {
  mmsi: 123456789,
  lat: 51.5,
  lon: -0.1,
  sog: 12.5,
  cog: 180,
  heading: 175,
  navStatus: 0,
  navStatusLabel: "Under way",
  lastSeen: 1_750_000_000_000,
};

describe("ship response codec", () => {
  test("validates and decodes a vessel", () => {
    const payload = parseShipServerPayload({
      data: [vessel],
      vesselCount: 1,
      connected: true,
    });
    expect(payload).not.toBeNull();
    expect(decodeShipPoints(payload ?? {
      vessels: [],
      vesselCount: 0,
      connected: false,
    })[0]).toMatchObject({
      id: "S123456789",
      type: "ships",
      lat: 51.5,
      lon: -0.1,
    });
  });

  test("rejects malformed fields and filters null island", () => {
    expect(
      parseShipServerPayload({
        data: [{ ...vessel, heading: "north" }],
        vesselCount: 1,
        connected: true,
      }),
    ).toBeNull();
    const payload = parseShipServerPayload({
      data: [{ ...vessel, lat: 0, lon: 0 }],
      vesselCount: 1,
      connected: true,
    });
    expect(
      payload ? decodeShipPoints(payload) : [],
    ).toHaveLength(0);
  });
});
