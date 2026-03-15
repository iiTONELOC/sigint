import type { BasePoint } from "./types";
import type { AircraftData } from "@/features/aircraft/types";

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

export type QuakeData = {
  magnitude?: number;
  depth?: number;
  location?: string;
};

// ── DataPoint union ──────────────────────────────────────────────────

export type DataPoint =
  | (BasePoint & { type: "ships"; data: ShipData })
  | (BasePoint & { type: "aircraft"; data: AircraftData })
  | (BasePoint & { type: "events"; data: EventData })
  | (BasePoint & { type: "quakes"; data: QuakeData });

export type DataType = DataPoint["type"];
