import { Plane } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { AircraftData, AircraftFilter } from "./types";
import type { BasePoint } from "@/features/base/types";
import { matchesAircraftFilter } from "./utils";
import { buildAircraftDetailRows } from "./detailRows";
import { AircraftTickerContent } from "./AircraftTickerContent";
import { AircraftFilterControl } from "./AircraftFilterControl";
import { DEFAULT_AIRCRAFT_FILTER } from "./filterUrl";

export const aircraftFeature: FeatureDefinition<AircraftData, AircraftFilter> = {
  id: "aircraft",
  label: "AIRCRAFT",
  icon: Plane,

  matchesFilter: (item: BasePoint & { data: AircraftData }, filter: AircraftFilter) =>
    matchesAircraftFilter(item, filter),

  defaultFilter: DEFAULT_AIRCRAFT_FILTER,

  buildDetailRows: (data: AircraftData, _timestamp?: string) =>
    buildAircraftDetailRows(data),

  TickerContent: AircraftTickerContent,

  FilterControl: AircraftFilterControl,
};
