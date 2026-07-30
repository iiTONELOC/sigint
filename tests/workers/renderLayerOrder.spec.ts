import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { type PointType } from "@shared/domain/pointType";
import { orderPointsByLayer } from "@/workers/render/layerOrder";

type Point = Readonly<{
  id: string;
  item: Readonly<{ type: string }>;
}>;

describe("render layer order", () => {
  test("orders the remaining legacy layers in one stable pass", () => {
    const points: Point[] = [
      { id: "cyclone-a", item: { type: Domain.Cyclones } },
      { id: "weather-a", item: { type: Domain.Weather } },
      {
        id: "forecast-a",
        item: { type: Domain.CyclonesForecast },
      },
      { id: "weather-b", item: { type: Domain.Weather } },
    ];

    expect(orderPointsByLayer(points).map((point) => point.id)).toEqual([
      "weather-a",
      "weather-b",
      "forecast-a",
      "cyclone-a",
    ]);
  });

  test("keeps equal legacy layers stable", () => {
    const points: Point[] = [
      { id: "weather-a", item: { type: Domain.Weather } },
      { id: "weather-b", item: { type: Domain.Weather } },
    ];

    expect(orderPointsByLayer(points).map((point) => point.id)).toEqual([
      "weather-a",
      "weather-b",
    ]);
  });
});
