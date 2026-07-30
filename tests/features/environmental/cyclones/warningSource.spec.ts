import { describe, test, expect } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  GeoJsonGeometryType,
  type GeoJsonPolygon,
  type GeoPoint,
} from "@shared/geo";
import { AreaKind } from "@/workers/render/protocol";
import { parseCycloneWarningCache } from "@/features/environmental/cyclones/data/warningCodec";
import {
  CycloneWarningSource,
  CYCLONE_WARNING_SOURCE_POLICY,
} from "@/features/environmental/cyclones/warningSource";
import {
  CycloneWarningField,
  type CycloneWarningPoint,
} from "@/features/environmental/cyclones/types";

const WARNING_POSITION: GeoPoint = [-80.5, 26.5];

const WARNING_GEOMETRY: GeoJsonPolygon = {
  type: GeoJsonGeometryType.Polygon,
  coordinates: [
    [
      [-81, 26],
      [-80, 26],
      [-80, 27],
      [-81, 26],
    ],
  ],
};

function makeWarning(
  overrides: Partial<CycloneWarningPoint["data"]> = {},
): CycloneWarningPoint {
  return {
    id: "NWS-TROPICAL-0001",
    type: Domain.CyclonesWarning,
    position: WARNING_POSITION,
    timestamp: "2026-07-29T12:00:00Z",
    data: {
      kind: AreaKind.Watch,
      geometry: WARNING_GEOMETRY,
      [CycloneWarningField.Alert]: "Hurricane Watch",
      [CycloneWarningField.Headline]: "Hurricane Watch in effect",
      [CycloneWarningField.Area]: "Coastal Palm Beach",
      [CycloneWarningField.Effective]: "2026-07-29T12:00:00Z",
      [CycloneWarningField.Expires]: "2026-07-30T00:00:00Z",
      ...overrides,
    },
  };
}

class ProbeSource extends CycloneWarningSource {
  changed(
    previous: CycloneWarningPoint,
    next: CycloneWarningPoint,
  ): boolean {
    return this.hasChanged(previous, next);
  }
}

describe("cyclone warning cache boundary", () => {
  test("accepts a warning whose position and geometry are in range", () => {
    expect(parseCycloneWarningCache([makeWarning()])).toHaveLength(1);
  });

  test("rejects a warning whose latitude is outside the sphere", () => {
    const warning = { ...makeWarning(), position: [-80.5, 500] };
    expect(parseCycloneWarningCache([warning])).toBeNull();
  });

  test("rejects geometry that names a polygon but carries no ring", () => {
    const warning = makeWarning();
    const broken = {
      ...warning,
      data: {
        ...warning.data,
        geometry: { type: GeoJsonGeometryType.Polygon, coordinates: [] },
      },
    };
    expect(parseCycloneWarningCache([broken])).toBeNull();
  });

  test("rejects a kind outside the declared area vocabulary", () => {
    const warning = makeWarning();
    const broken = { ...warning, data: { ...warning.data, kind: "advisory" } };
    expect(parseCycloneWarningCache([broken])).toBeNull();
  });
});

describe("cyclone warning change detection", () => {
  const source = new ProbeSource();

  test("an unchanged warning publishes nothing", () => {
    expect(source.changed(makeWarning(), makeWarning())).toBe(false);
  });

  test("a watch upgraded to a warning publishes", () => {
    const next = makeWarning({ kind: AreaKind.Warning });
    expect(source.changed(makeWarning(), next)).toBe(true);
  });

  test("an extended expiry publishes", () => {
    const next = makeWarning({
      [CycloneWarningField.Expires]: "2026-07-30T12:00:00Z",
    });
    expect(source.changed(makeWarning(), next)).toBe(true);
  });

  test("a reworded headline publishes", () => {
    const next = makeWarning({
      [CycloneWarningField.Headline]: "Hurricane Watch extended inland",
    });
    expect(source.changed(makeWarning(), next)).toBe(true);
  });

  test("a moved polygon centroid publishes", () => {
    const next = { ...makeWarning(), position: [-80.4, 26.5] as GeoPoint };
    expect(source.changed(makeWarning(), next)).toBe(true);
  });
});

describe("cyclone warning source policy", () => {
  test("declares the warning identity once", () => {
    expect(CYCLONE_WARNING_SOURCE_POLICY.id).toBe(Domain.CycloneWarnings);
    expect(new CycloneWarningSource().pointType).toBe(Domain.CyclonesWarning);
  });
});
