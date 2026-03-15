import type { BasePoint } from "./types";
import type { AircraftData } from "@/features/tracking/aircraft/types";
import type { EarthquakeData } from "@/features/environmental/earthquake/types";

// ── Per-feature data shapes ──────────────────────────────────────────
// These live here until they graduate to their own feature folders.

export type ShipData = {
  name?: string;
  vesselType?: string;
  flag?: string;
  speed?: number;
  heading?: number;
};

export type EventData = {
  category?: string;
  headline?: string;
  source?: string;
  severity?: number;
};

// ── DataPoint union ──────────────────────────────────────────────────

export type DataPoint =
  | (BasePoint & { type: "ships"; data: ShipData })
  | (BasePoint & { type: "aircraft"; data: AircraftData })
  | (BasePoint & { type: "events"; data: EventData })
  | (BasePoint & { type: "quakes"; data: EarthquakeData });

export type DataType = DataPoint["type"];
