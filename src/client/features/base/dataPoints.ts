import type { BasePoint } from "./types";
import type { AircraftData } from "@/features/tracking/aircraft/types";
import type { EarthquakeData } from "@/features/environmental/earthquake/types";
import type { ShipData } from "@/features/tracking/ships/types";
import type { EventData } from "@/features/intel/events/types";

// ── DataPoint union ──────────────────────────────────────────────────

export type DataPoint =
  | (BasePoint & { type: "ships"; data: ShipData })
  | (BasePoint & { type: "aircraft"; data: AircraftData })
  | (BasePoint & { type: "events"; data: EventData })
  | (BasePoint & { type: "quakes"; data: EarthquakeData });

export type DataType = DataPoint["type"];

// Re-export so existing consumers from this path don't break
export type { ShipData, EventData };
