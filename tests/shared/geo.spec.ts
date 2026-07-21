import { describe, expect, it } from "bun:test";
import {
  multiPolygonContainsPoint,
  parseGeoJsonPolygonGeometry,
  geometryPolygons,
  type GeoMultiPolygon,
} from "@shared/geo";
import { parseLandGeoJson } from "@shared/land";

const POLYGON_WITH_HOLE: GeoMultiPolygon = [
  [
    [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
      [-10, -10],
    ],
    [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
      [-2, -2],
    ],
  ],
];

describe("canonical polygon geometry", () => {
  it("treats an interior ring as water", () => {
    expect(multiPolygonContainsPoint([5, 5], POLYGON_WITH_HOLE)).toBe(true);
    expect(multiPolygonContainsPoint([0, 0], POLYGON_WITH_HOLE)).toBe(false);
  });

  it("keeps antimeridian polygons contiguous", () => {
    const geometry = parseGeoJsonPolygonGeometry({
      type: "Polygon",
      coordinates: [
        [
          [170, -10],
          [-170, -10],
          [-170, 10],
          [170, 10],
          [170, -10],
        ],
      ],
    });
    expect(geometry).not.toBeNull();
    if (!geometry) return;
    const polygons = geometryPolygons(geometry);
    expect(multiPolygonContainsPoint([179, 0], polygons)).toBe(true);
    expect(multiPolygonContainsPoint([0, 0], polygons)).toBe(false);
  });

  it("classifies the reported Gulf position as water", async () => {
    const source: unknown = await Bun.file(
      "public/data/ne_50m_land.json",
    ).json();
    const land = parseLandGeoJson(source);
    expect(land.length).toBeGreaterThan(0);
    expect(multiPolygonContainsPoint([-86, 28.6], land)).toBe(false);
    expect(multiPolygonContainsPoint([-81.66, 30.33], land)).toBe(true);
  });
});
