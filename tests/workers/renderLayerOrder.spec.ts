import { describe, expect, test } from "bun:test";
import { orderPointsByLayer } from "@/workers/render/layerOrder";

type Point = Readonly<{
  id: string;
  item: Readonly<{ type: string }>;
}>;

describe("render layer order", () => {
  test("orders in one stable pass", () => {
    const points: Point[] = [
      { id: "quake-a", item: { type: "quakes" } },
      { id: "aircraft-a", item: { type: "aircraft" } },
      { id: "quake-b", item: { type: "quakes" } },
      { id: "ship-a", item: { type: "ships" } },
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
      { id: "ship-a", item: { type: "ships" } },
      { id: "unknown-a", item: { type: "unknown" } },
    ];

    expect(orderPointsByLayer(points).map((point) => point.id)).toEqual([
      "unknown-a",
      "ship-a",
    ]);
  });
});
