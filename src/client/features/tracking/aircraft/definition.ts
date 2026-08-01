import { Domain } from "@shared/domain/identity";
import { Plane } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { AircraftData } from "./types";
import { buildAircraftDetailRows } from "./detailRows";
import { AircraftTickerContent } from "./ui/AircraftTickerContent";
import {
  aircraftFeedPresentation,
  aircraftTablePresentation,
} from "./formatters";

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

export const aircraftFeature = defineFeature<AircraftData, Domain.Aircraft>({
    id: Domain.Aircraft,
    label: "AIRCRAFT",
    icon: Plane,
    iconStyle: FeatureIconStyle.Filled,
    colorClassName: FeatureColorClassName.Aircraft,

    buildDetailRows: (data: AircraftData, _timestamp?: string) =>
      buildAircraftDetailRows(data),
    tablePresentation: aircraftTablePresentation,
    feedPresentation: aircraftFeedPresentation,

    TickerContent: AircraftTickerContent,

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
  });
