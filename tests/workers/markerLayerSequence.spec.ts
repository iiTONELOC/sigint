import { describe, expect, test } from "bun:test";
import { drawMarkerLayerSequence } from "@/workers/render/layerSequence";

enum DrawOrder {
  Fire = 1,
  Event = 2,
  Earthquake = 3,
  Weather = 4,
  Legacy = 5,
}

describe("marker layer sequence", () => {
  test("draws fires below events and earthquakes above events", () => {
    const observed: DrawOrder[] = [];

    drawMarkerLayerSequence({
      fire: () => observed.push(DrawOrder.Fire),
      event: () => observed.push(DrawOrder.Event),
      earthquake: () => observed.push(DrawOrder.Earthquake),
      weather: () => observed.push(DrawOrder.Weather),
      legacy: () => observed.push(DrawOrder.Legacy),
    });

    expect(observed).toEqual([
      DrawOrder.Fire,
      DrawOrder.Event,
      DrawOrder.Earthquake,
      DrawOrder.Weather,
      DrawOrder.Legacy,
    ]);
  });
});
