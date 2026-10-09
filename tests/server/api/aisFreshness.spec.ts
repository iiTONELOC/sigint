import { afterEach, describe, expect, test } from "bun:test";
import { MS_PER_HOUR } from "@shared/time";
import {
  AisMessageType,
  getAisCache,
  receiveAisMessage,
  __resetAisCacheForTests,
} from "../../../src/server/api/aisCache";

const RECEIVED_AT = 1_000_000_000;

function positionReport(mmsi: number): unknown {
  return {
    MessageType: AisMessageType.PositionReport,
    MetaData: { MMSI: mmsi, ShipName: "TEST VESSEL" },
    Message: { [AisMessageType.PositionReport]: { Latitude: 25.5, Longitude: -80.2, Sog: 10 } },
  };
}

afterEach(() => {
  __resetAisCacheForTests();
});

describe("getAisCache freshness", () => {
  test("reports no data until the first AIS message arrives", () => {
    expect(getAisCache(RECEIVED_AT).data).toBeNull();
  });

  test("serves a vessel for an hour after its last report, then drops it", () => {
    receiveAisMessage(positionReport(123456789), RECEIVED_AT);
    expect(getAisCache(RECEIVED_AT + MS_PER_HOUR).vesselCount).toBe(1);
    expect(getAisCache(RECEIVED_AT + MS_PER_HOUR + 1).vesselCount).toBe(0);
  });

  test("an emptied set is served as an empty list, so browsers drop their old ships", () => {
    receiveAisMessage(positionReport(123456789), RECEIVED_AT);
    expect(getAisCache(RECEIVED_AT + 2 * MS_PER_HOUR).data).toEqual([]);
  });
});
