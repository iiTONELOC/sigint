import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { AisNavigationStatus } from "@shared/domain/ships";
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
  navStatus: AisNavigationStatus.UnderWayUsingEngine,
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
      type: Domain.Ships,
      position: [-0.1, 51.5],
    });
  });

  test("skips malformed fields and filters null island", () => {
    const mixed = parseShipServerPayload({
      data: [vessel, { ...vessel, heading: "north" }],
      vesselCount: 2,
      connected: true,
    });
    expect(mixed?.vessels).toHaveLength(1);
    expect(mixed?.vesselCount).toBe(2);
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
