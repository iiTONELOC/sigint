import type { BasePoint } from "./types";
import { Domain } from "@shared/domain/identity";
import type { EarthquakeData } from "@shared/domain/earthquakes";
import type { AircraftPoint } from "@shared/domain/aircraft";
import type { ShipPoint } from "@shared/domain/ships";
import type { EventData } from "@shared/domain/events";
import type { FireData } from "@shared/domain/fireDayNight";
import type { WeatherPoint } from "@shared/domain/weather";
import type {
  CycloneData,
  CycloneForecastPointData,
  CycloneWarningPoint,
} from "@shared/domain/cyclones";

// ── DataPoint union ──────────────────────────────────────────────────

export type DataPoint =
  | ShipPoint
  | AircraftPoint
  | (BasePoint & { type: Domain.Events; data: EventData })
  | (BasePoint & { type: Domain.Quakes; data: EarthquakeData })
  | (BasePoint & { type: Domain.Fires; data: FireData })
  | WeatherPoint
  | (BasePoint & {
      type: Domain.CyclonesForecast;
      data: CycloneForecastPointData;
    })
  | (BasePoint & { type: Domain.Cyclones; data: CycloneData })
  | CycloneWarningPoint;

export type DataType = DataPoint["type"];

export function canonicalEntityId(point: DataPoint): string {
  return point.type === Domain.CyclonesForecast
    ? point.data.parentEntityId
    : point.id;
}

export type { PointType } from "@shared/domain/pointType";

export type { ShipData } from "@shared/domain/ships";
export type { FireData } from "@shared/domain/fireDayNight";
