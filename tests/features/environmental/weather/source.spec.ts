import { describe, test, expect } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  GeoJsonGeometryType,
  type GeoJsonPolygon,
  type GeoPoint,
} from "@shared/geo";
import { parseWeatherCache } from "@/features/environmental/weather/data/codec";
import {
  WeatherAlertSource,
  weatherSceneBinding,
} from "@/features/environmental/weather/source";
import {
  WeatherSeverity,
  WeatherTextField,
  type WeatherPoint,
} from "@shared/domain/weather";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  SceneDataCommandType,
  type SceneSourcePatch,
} from "@/workers/render/sceneProtocol";
import { WeatherSceneAttribute } from "@shared/scene";
import { SourceCompleteness } from "@shared/source";

const ALERT_POSITION: GeoPoint = [-97.5, 35.5];

const ALERT_GEOMETRY: GeoJsonPolygon = {
  type: GeoJsonGeometryType.Polygon,
  coordinates: [
    [
      [-98, 35],
      [-97, 35],
      [-97, 36],
      [-98, 35],
    ],
  ],
};

function makeAlert(overrides: Partial<WeatherPoint["data"]> = {}): WeatherPoint {
  return {
    id: "NWS-TEST-0001",
    type: Domain.Weather,
    position: ALERT_POSITION,
    timestamp: "2026-07-29T12:00:00Z",
    data: {
      severity: WeatherSeverity.Severe,
      geometry: ALERT_GEOMETRY,
      [WeatherTextField.Event]: "Severe Thunderstorm Warning",
      [WeatherTextField.Headline]: "Severe Thunderstorm Warning until 2 PM",
      [WeatherTextField.Expires]: "2026-07-29T14:00:00Z",
      ...overrides,
    },
  };
}

class ProbeSource extends WeatherAlertSource {
  changed(previous: WeatherPoint, next: WeatherPoint): boolean {
    return this.hasChanged(previous, next);
  }
}

describe("weather cache boundary", () => {
  test("accepts an alert whose position and geometry are in range", () => {
    expect(parseWeatherCache([makeAlert()])).toHaveLength(1);
  });

  test("rejects an alert whose latitude is outside the sphere", () => {
    const alert = { ...makeAlert(), position: [-97.5, 500] };
    expect(parseWeatherCache([alert])).toBeNull();
  });

  test("rejects an alert whose longitude is outside the sphere", () => {
    const alert = { ...makeAlert(), position: [-400, 35.5] };
    expect(parseWeatherCache([alert])).toBeNull();
  });

  test("rejects geometry that names a polygon but carries no ring", () => {
    const alert = makeAlert();
    const broken = {
      ...alert,
      data: {
        ...alert.data,
        geometry: { type: GeoJsonGeometryType.Polygon, coordinates: [] },
      },
    };
    expect(parseWeatherCache([broken])).toBeNull();
  });

  test("rejects geometry whose ring is too short to close", () => {
    const alert = makeAlert();
    const broken = {
      ...alert,
      data: {
        ...alert.data,
        geometry: {
          type: GeoJsonGeometryType.Polygon,
          coordinates: [[[-98, 35], [-97, 35]]],
        },
      },
    };
    expect(parseWeatherCache([broken])).toBeNull();
  });

  test("rejects an open polygon ring", () => {
    const alert = makeAlert();
    const broken = {
      ...alert,
      data: {
        ...alert.data,
        geometry: {
          type: GeoJsonGeometryType.Polygon,
          coordinates: [
            [
              [-98, 35],
              [-97, 35],
              [-97, 36],
              [-98, 36],
            ],
          ],
        },
      },
    };
    expect(parseWeatherCache([broken])).toBeNull();
  });
});

describe("weather change detection", () => {
  const source = new ProbeSource();

  test("an unchanged alert publishes nothing", () => {
    expect(source.changed(makeAlert(), makeAlert())).toBe(false);
  });

  test("an upgraded severity publishes", () => {
    const next = makeAlert({ severity: WeatherSeverity.Extreme });
    expect(source.changed(makeAlert(), next)).toBe(true);
  });

  test("an extended expiry publishes", () => {
    const next = makeAlert({
      [WeatherTextField.Expires]: "2026-07-29T16:00:00Z",
    });
    expect(source.changed(makeAlert(), next)).toBe(true);
  });

  test("a reworded headline publishes", () => {
    const next = makeAlert({
      [WeatherTextField.Headline]: "Severe Thunderstorm Warning until 4 PM",
    });
    expect(source.changed(makeAlert(), next)).toBe(true);
  });

  test("a moved polygon centroid publishes", () => {
    const next = { ...makeAlert(), position: [-97.4, 35.5] as GeoPoint };
    expect(source.changed(makeAlert(), next)).toBe(true);
  });

  test("changed polygon topology publishes at a retained centroid", () => {
    const next = makeAlert({
      geometry: {
        type: GeoJsonGeometryType.Polygon,
        coordinates: [
          [
            [-98, 35],
            [-96.5, 35],
            [-97, 36],
            [-98, 35],
          ],
        ],
      },
    });
    expect(source.changed(makeAlert(), next)).toBe(true);
  });
});

describe("weather source policy", () => {
  test("consumes the registered weather identity", () => {
    const policy = new WeatherAlertSource().policy;
    expect(policy.id).toBe(Domain.Weather);
    expect(policy.pointType).toBe(Domain.Weather);
  });
});

describe("weather scene publication", () => {
  test("publishes geometry patch, reconnect, and delete semantics", async () => {
    let entities: readonly WeatherPoint[] = [makeAlert()];
    let observedAt = 1;
    const patches: SceneSourcePatch[] = [];
    const binding = weatherSceneBinding((command) => {
      if (command.type === SceneDataCommandType.SourcePatch) {
        patches.push(command);
      }
    });
    const source = new WeatherAlertSource({
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
      makeAlert({
        geometry: {
          type: GeoJsonGeometryType.MultiPolygon,
          coordinates: [
            ALERT_GEOMETRY.coordinates,
            [
              [
                [-96, 34],
                [-95, 34],
                [-95, 35],
                [-96, 34],
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
    expect(patches[0]?.source).toBe(Domain.Weather);
    expect(Array.from(patches[0]?.geometryPartEnds ?? [])).toEqual([
      4,
    ]);
    expect(
      patches[0]?.attributes[WeatherSceneAttribute.Severity],
    ).toBeGreaterThan(0);
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
