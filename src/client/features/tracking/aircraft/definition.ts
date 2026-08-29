import { Domain } from "@shared/domain/identity";
import { Plane } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeaturePresentationText,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { AircraftData } from "@shared/domain/aircraft";
import { EMPTY_TEXT } from "@shared/text";
import { AircraftDetailSummary } from "./ui/AircraftDetailSummary";
import { AircraftTickerContent } from "./ui/AircraftTickerContent";
import {
  aircraftExternalLinks,
  aircraftFeedPresentation,
  AircraftLinkSurface,
  aircraftSearchText,
  aircraftTablePresentation,
} from "./formatters/presentation";

export const aircraftFeature = defineFeature<AircraftData, Domain.Aircraft>({
    id: Domain.Aircraft,
    label: "AIRCRAFT",
    icon: Plane,
    iconStyle: FeatureIconStyle.Filled,
    colorClassName: FeatureColorClassName.Aircraft,
    DetailSummary: AircraftDetailSummary,

    alertDetail: (data) => [
      data.callsign?.trim() || data.icao24 || EMPTY_TEXT,
      data.originCountry || EMPTY_TEXT,
    ],
    buildDetailRows: (data: AircraftData) =>
      aircraftExternalLinks(data, AircraftLinkSurface.Detail),
    tablePresentation: aircraftTablePresentation,
    feedPresentation: aircraftFeedPresentation,

    TickerContent: AircraftTickerContent,
    tickerSummary: (data) => {
      const summary = [
        data.callsign?.trim() ||
          data.icao24 ||
          FeaturePresentationText.Unknown,
      ];
      if (
        data.acType &&
        data.acType !== FeaturePresentationText.Unknown
      ) {
        summary.push(data.acType);
      }
      if (data.originCountry) summary.push(data.originCountry);
      return summary;
    },

    getSearchText: aircraftSearchText,
    searchPresentation: (data, id) => ({
      primary: data.callsign || data.icao24 || id,
      secondary:
        [
          data.acType && data.acType !== FeaturePresentationText.Unknown
            ? data.acType
            : null,
          data.originCountry,
          data.operator,
        ]
          .filter(Boolean)
          .join(FeaturePresentationText.Separator) ||
        FeaturePresentationText.Unknown,
    }),
  });
