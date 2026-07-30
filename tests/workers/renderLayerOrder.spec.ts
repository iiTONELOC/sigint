import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { orderPointsByLayer } from "@/workers/render/layerOrder";

type Point = Readonly<{
  id: string;
  item: Readonly<{ type: string }>;
}>;

describe("render layer order", () => {
  test("orders the remaining legacy layers in one stable pass", () => {
    const points: Point[] = [
      { id: "cyclone-a", item: { type: Domain.Cyclones } },
      {
        id: "forecast-a",
        item: { type: Domain.CyclonesForecast },
      },
    ];

    expect(orderPointsByLayer(points).map((point) => point.id)).toEqual([
      "forecast-a",
      "cyclone-a",
    ]);
  });

  test("keeps equal legacy layers stable", () => {
    const points: Point[] = [
      { id: "cyclone-a", item: { type: Domain.Cyclones } },
      { id: "cyclone-b", item: { type: Domain.Cyclones } },
    ];

    expect(orderPointsByLayer(points).map((point) => point.id)).toEqual([
      "cyclone-a",
      "cyclone-b",
    ]);
  });
});
