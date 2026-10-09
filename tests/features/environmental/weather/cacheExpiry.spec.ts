import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { WeatherSeverity } from "@shared/domain/weather";
import { parseWeatherCache } from "@/features/environmental/weather/data/codec";

const NOW = Date.parse("2026-10-09T22:00:00Z");

function alert(id: string, expires: string): unknown {
  return {
    id,
    type: Domain.Weather,
    position: [-97.5, 35.5],
    data: { severity: WeatherSeverity.Severe, expires },
  };
}

describe("parseWeatherCache", () => {
  test("drops alerts that expired while the app was closed and keeps active ones", () => {
    const cached = [alert("expired", "2026-10-09T21:00:00Z"), alert("active", "2026-10-09T23:00:00Z")];
    expect(parseWeatherCache(cached, NOW)?.map((point) => point.id)).toEqual(["active"]);
  });
});
