import { describe, test, expect } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  GeoJsonGeometryType,
  type GeoJsonPolygon,
  type GeoPoint,
} from "@shared/geo";
import {
  AreaKind,
  CycloneWarningField,
  type CycloneWarningPoint,
} from "@shared/domain/cyclones";
import { parseCycloneWarningCache } from "@/features/environmental/cyclones/data/warningCodec";
import {
  CycloneWarningSceneBinding,
  CycloneWarningSource,
} from "@/features/environmental/cyclones/warningSource";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  CycloneWarningSceneAttribute,
} from "@shared/scene";
import {
  SceneDataCommandType,
  type SceneSourcePatch,
} from "@/workers/render/sceneProtocol";
import { SourceCompleteness } from "@shared/source";

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

  test("rejects an open polygon ring", () => {
    const warning = makeWarning();
    const broken = {
      ...warning,
      data: {
        ...warning.data,
        geometry: {
          type: GeoJsonGeometryType.Polygon,
          coordinates: [
            [
              [-81, 26],
              [-80, 26],
              [-80, 27],
              [-81, 27],
            ],
          ],
        },
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

  test("changed polygon topology publishes at a retained centroid", () => {
    const next = makeWarning({
      geometry: {
        type: GeoJsonGeometryType.Polygon,
        coordinates: [
          [
            [-81, 26],
            [-79.5, 26],
            [-80, 27],
            [-81, 26],
          ],
        ],
      },
    });
    expect(source.changed(makeWarning(), next)).toBe(true);
  });
});

describe("cyclone warning source policy", () => {
  test("consumes the registered warning identity", () => {
    const policy = new CycloneWarningSource().policy;
    expect(policy.id).toBe(Domain.CycloneWarnings);
    expect(policy.pointType).toBe(Domain.CyclonesWarning);
  });
});

describe("cyclone warning scene publication", () => {
  test("publishes geometry patch, reconnect, and delete semantics", async () => {
    let entities: readonly CycloneWarningPoint[] = [makeWarning()];
    let observedAt = 1;
    const patches: SceneSourcePatch[] = [];
    const binding = new CycloneWarningSceneBinding((command) => {
      if (command.type === SceneDataCommandType.SourcePatch) {
        patches.push(command);
      }
    });
    const source = new CycloneWarningSource({
      fetchSnapshot: async () => ({
        completeness: SourceCompleteness.Complete,
        entities,
        observedAt,
      }),
    });
    source.attach({
      readCache: async () => null,
      persistCache: () => undefined,
      publishStatus: () => undefined,
      publishPatch: (patch) => binding.publish(patch),
    });

    await source.refresh();
    observedAt += 1;
    entities = [
      makeWarning({
        kind: AreaKind.Warning,
        geometry: {
          type: GeoJsonGeometryType.MultiPolygon,
          coordinates: [
            WARNING_GEOMETRY.coordinates,
            [
              [
                [-79, 25],
                [-78, 25],
                [-78, 26],
                [-79, 25],
              ],
            ],
          ],
        },
      }),
    ];
    await source.refresh();
    source.publishRebase();
    observedAt += 1;
    entities = [];
    await source.refresh();

    expect(patches).toHaveLength(4);
    expect(patches[0]?.kind).toBe(DatasetPatchKind.Rebase);
    expect(patches[0]?.source).toBe(Domain.CycloneWarnings);
    expect(Array.from(patches[0]?.geometryPartEnds ?? [])).toEqual([
      4,
    ]);
    expect(
      patches[1]?.attributes[CycloneWarningSceneAttribute.Kind],
    ).toBeGreaterThan(
      patches[0]?.attributes[CycloneWarningSceneAttribute.Kind] ??
        0,
    );
    expect(Array.from(patches[1]?.geometryGroupEnds ?? [])).toEqual([
      1,
      2,
    ]);
    expect(patches[2]?.kind).toBe(DatasetPatchKind.Rebase);
    expect(Array.from(patches[3]?.deletedHandles ?? [])).toEqual([
      1,
    ]);
  });
});
