import { Plane } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { AircraftData, AircraftFilter } from "./types";
import type { BasePoint } from "@/features/base/types";
import { matchesAircraftFilter } from "./lib/utils";
import { buildAircraftDetailRows } from "./detailRows";
import { AircraftTickerContent } from "./ui/AircraftTickerContent";
import { AircraftFilterControl } from "./ui/AircraftFilterControl";
import { DEFAULT_AIRCRAFT_FILTER } from "./lib/filterUrl";

export const aircraftFeature: FeatureDefinition<AircraftData, AircraftFilter> =
  {
    id: "aircraft",
    label: "AIRCRAFT",
    icon: Plane,

    matchesFilter: (
      item: BasePoint & { data: AircraftData },
      filter: AircraftFilter,
    ) => matchesAircraftFilter(item, filter),

    defaultFilter: DEFAULT_AIRCRAFT_FILTER,

    buildDetailRows: (data: AircraftData, _timestamp?: string) =>
      buildAircraftDetailRows(data),

    TickerContent: AircraftTickerContent,

    FilterControl: AircraftFilterControl,

    getSearchText: (data: AircraftData) =>
      [
        data.callsign,
        data.icao24,
        data.acType,
        data.registration,
        data.operator,
        data.manufacturerName,
        data.model,
        data.categoryDescription,
        data.originCountry,
        data.squawk,
      ]
        .filter(Boolean)
        .join(" "),
  };
