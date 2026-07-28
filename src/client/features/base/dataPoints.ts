import type { BasePoint } from "./types";
import { Domain } from "@shared/domain/identity";
import type { AircraftData } from "@/features/tracking/aircraft/types";
import type { EarthquakeData } from "@/features/environmental/earthquake/types";
import type { ShipData } from "@/features/tracking/ships/types";
import type { EventData } from "@/features/intel/events/types";
import type { FireData } from "@/features/environmental/fires/types";
import type { WeatherData } from "@/features/environmental/weather/types";
import type {
  CycloneData,
  CycloneForecastPointData,
} from "@/features/environmental/cyclones/types";
import type { CycloneWarning } from "@/features/environmental/cyclones/data/warnings";

// ── DataPoint union ──────────────────────────────────────────────────

export type DataPoint =
  | (BasePoint & { type: Domain.Ships; data: ShipData })
  | (BasePoint & { type: Domain.Aircraft; data: AircraftData })
  | (BasePoint & { type: Domain.Events; data: EventData })
  | (BasePoint & { type: Domain.Quakes; data: EarthquakeData })
  | (BasePoint & { type: Domain.Fires; data: FireData })
  | (BasePoint & { type: Domain.Weather; data: WeatherData })
  | (BasePoint & {
      type: Domain.CyclonesForecast;
      data: CycloneForecastPointData;
    })
  | (BasePoint & { type: Domain.Cyclones; data: CycloneData })
  | (BasePoint & { type: Domain.CyclonesWarning; data: CycloneWarning });

export type DataType = DataPoint["type"];

export type { PointType } from "@shared/domain/pointType";

// Re-export so existing consumers from this path don't break
export type { ShipData } from "@/features/tracking/ships/types";
export type { EventData } from "@/features/intel/events/types";
export type { FireData } from "@/features/environmental/fires/types";
export type { WeatherData } from "@/features/environmental/weather/types";
export type { CycloneData } from "@/features/environmental/cyclones/types";
