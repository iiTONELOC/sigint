import { describe, test, expect } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { GeoJsonGeometryType, type GeoPoint } from "@shared/geo";
import { parseWeatherCache } from "@/features/environmental/weather/data/codec";
import { WeatherSeverity } from "@/features/environmental/weather/severity";
import {
  WeatherAlertSource,
  WEATHER_SOURCE_POLICY,
} from "@/features/environmental/weather/source";
import {
  WeatherTextField,
  type WeatherPoint,
} from "@/features/environmental/weather/types";

const ALERT_POSITION: GeoPoint = [-97.5, 35.5];

const ALERT_GEOMETRY = {
  type: GeoJsonGeometryType.Polygon,
  coordinates: [
    [
      [-98, 35],
      [-97, 35],
      [-97, 36],
      [-98, 35],
    ],
  ],
} as const;

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
});

describe("weather source policy", () => {
  test("declares the weather identity once", () => {
    expect(WEATHER_SOURCE_POLICY.id).toBe(Domain.Weather);
    expect(new WeatherAlertSource().pointType).toBe(Domain.Weather);
  });
});
