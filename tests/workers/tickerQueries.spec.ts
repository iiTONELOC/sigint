import { describe, expect, test } from "bun:test";
import type { AircraftPoint } from "@/features/tracking/aircraft/data/codec";
import type { ShipPoint } from "@/features/tracking/ships/data/codec";
import { AIRCRAFT_UI_QUERIES } from "@/features/tracking/aircraft/data/uiQueries";
import { SHIP_UI_QUERIES } from "@/features/tracking/ships/data/uiQueries";
import type { PointUiQuery } from "@/workers/data/uiQuery";

const TICKER: PointUiQuery = { kind: "ticker", limit: 10 };
const TIMESTAMP = "2026-07-21T12:00:00.000Z";

function aircraft(
  id: string,
  data: AircraftPoint["data"],
  timestamp = TIMESTAMP,
): AircraftPoint {
  return { id, type: "aircraft", lat: 35, lon: 139, timestamp, data };
}

function ship(id: string, sog: number): ShipPoint {
  return {
    id,
    type: "ships",
    lat: 51,
    lon: -0.1,
    timestamp: TIMESTAMP,
    data: { name: id, sog },
  };
}

describe("aircraft ticker eligibility", () => {
  test("airborne aircraft are in the feed, parked ones are not", () => {
    const result = AIRCRAFT_UI_QUERIES.run(
      [
        aircraft("airborne", { onGround: false, callsign: "UAL123" }),
        aircraft("parked", { onGround: true, callsign: "UAL456" }),
      ],
      TICKER,
    );
    expect(result.items.map((point) => point.id)).toEqual(["airborne"]);
  });

  test("an escalated squawk leads the page and stays in it on the ground", () => {
    const result = AIRCRAFT_UI_QUERIES.run(
      [
        aircraft(
          "routine",
          { onGround: false, squawk: "1200" },
          "2026-07-21T13:00:00.000Z",
        ),
        aircraft("mayday", { onGround: true, squawk: "7700" }),
      ],
      TICKER,
    );
    expect(result.kind).toBe("ticker");
    expect(result.items.map((point) => point.id)).toEqual([
      "mayday",
      "routine",
    ]);
    expect(result.kind === "ticker" && result.priorityCount).toBe(1);
  });
});

describe("ship ticker eligibility", () => {
  test("vessels under way are in the feed, moored ones are not", () => {
    const result = SHIP_UI_QUERIES.run([ship("moving", 5), ship("moored", 0.1)], TICKER);
    expect(result.items.map((point) => point.id)).toEqual(["moving"]);
    expect(result.kind === "ticker" && result.priorityCount).toBe(0);
  });
});
