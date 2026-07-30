import type { BasePoint } from "./types";
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
  | (BasePoint & { type: "ships"; data: ShipData })
  | (BasePoint & { type: "aircraft"; data: AircraftData })
  | (BasePoint & { type: "events"; data: EventData })
  | (BasePoint & { type: "quakes"; data: EarthquakeData })
  | (BasePoint & { type: "fires"; data: FireData })
  | (BasePoint & { type: "weather"; data: WeatherData })
  | (BasePoint & { type: "cyclones"; data: CycloneData })
  | (BasePoint & { type: "cyclones-forecast"; data: CycloneForecastPointData })
  | (BasePoint & { type: "cyclones-warning"; data: CycloneWarning });

export type DataType = DataPoint["type"];

// Re-export so existing consumers from this path don't break
export type { ShipData } from "@/features/tracking/ships/types";
export type { EventData } from "@/features/intel/events/types";
export type { FireData } from "@/features/environmental/fires/types";
export type { WeatherData } from "@/features/environmental/weather/types";
export type { CycloneData } from "@/features/environmental/cyclones/types";
