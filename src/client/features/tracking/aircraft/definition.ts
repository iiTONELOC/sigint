import { Plane } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { AircraftData, AircraftFilter } from "./types";
import type { BasePoint } from "@/features/base/types";
import { matchesAircraftFilter } from "./lib/utils";
import { buildAircraftDetailRows } from "./detailRows";
import { AircraftTickerContent } from "./ui/AircraftTickerContent";
import { AircraftFilterControl } from "./ui/AircraftFilterControl";
import { DEFAULT_AIRCRAFT_FILTER } from "./lib/filterUrl";

// NOAA WP-3D / G-IV recon aircraft have well-known nicknames; surface them
// as search terms so "kermit" / "miss piggy" / "gonzo" find the right bird.
// Keyed by registration (preferred) then ICAO hex. The USAF WC-130J fleet
// has no per-airframe nicknames, so it relies on callsign (TEAL/CODY).
const RECON_NICKNAMES: Record<string, string> = {
  N42RF: "kermit",
  N43RF: "miss piggy",
  N49RF: "gonzo",
  A4FAC3: "kermit",
  A52242: "miss piggy",
  A60F3C: "gonzo",
};

function reconNicknames(data: AircraftData): string {
  const reg = (data.registration ?? "").toUpperCase();
  const hex = (data.icao24 ?? "").toUpperCase();
  return RECON_NICKNAMES[reg] ?? RECON_NICKNAMES[hex] ?? "";
}

export const aircraftFeature: FeatureDefinition<AircraftData, AircraftFilter> =
  {
    id: "aircraft",
    label: "AIRCRAFT",
    icon: Plane,
    iconProps: { fill: "currentColor", strokeWidth: 0 },

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
        data.military ? "military mil" : "",
        // Recon birds are findable by their well-known names. Callsign +
        // registration already cover TEAL/CODY and N42RF/N43RF/N49RF; this
        // adds the role keywords and the NOAA WP-3D/G-IV nicknames.
        data.recon ? `recon hurricane hunter ${reconNicknames(data)}` : "",
      ]
        .filter(Boolean)
        .join(" "),
  };
