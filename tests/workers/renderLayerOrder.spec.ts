import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { type PointType } from "@shared/domain/pointType";
import { orderPointsByLayer } from "@/workers/render/layerOrder";

type Point = Readonly<{
  id: string;
  item: Readonly<{ type: string }>;
}>;

describe("render layer order", () => {
  test("orders in one stable pass", () => {
    const points: Point[] = [
      { id: "quake-a", item: { type: Domain.Quakes } },
      { id: "aircraft-a", item: { type: Domain.Aircraft } },
      { id: "quake-b", item: { type: Domain.Quakes } },
      { id: "ship-a", item: { type: Domain.Ships } },
    ];

    expect(orderPointsByLayer(points).map((point) => point.id)).toEqual([
      "aircraft-a",
      "ship-a",
      "quake-a",
      "quake-b",
    ]);
  });

  test("keeps unknown layers at the existing base order", () => {
    const points: Point[] = [
      { id: "ship-a", item: { type: Domain.Ships } },
      { id: "unknown-a", item: { type: "unknown" } },
    ];

    expect(orderPointsByLayer(points).map((point) => point.id)).toEqual([
      "unknown-a",
      "ship-a",
    ]);
  });
});
