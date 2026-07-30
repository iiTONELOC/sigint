import { describe, expect, test } from "bun:test";
import { drawMarkerLayerSequence } from "@/workers/render/layerSequence";

enum DrawOrder {
  Fire = 1,
  Event = 2,
  Earthquake = 3,
  Legacy = 4,
}

describe("marker layer sequence", () => {
  test("draws fires below events and earthquakes above events", () => {
    const observed: DrawOrder[] = [];

    drawMarkerLayerSequence({
      fire: () => observed.push(DrawOrder.Fire),
      event: () => observed.push(DrawOrder.Event),
      earthquake: () => observed.push(DrawOrder.Earthquake),
      legacy: () => observed.push(DrawOrder.Legacy),
    });

    expect(observed).toEqual([
      DrawOrder.Fire,
      DrawOrder.Event,
      DrawOrder.Earthquake,
      DrawOrder.Legacy,
    ]);
  });
});
