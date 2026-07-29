import { Domain } from "@shared/domain/identity";
import { Wind } from "lucide-react";
import {
  STROKED_ICON_PROPS,
  type FeatureDefinition,
} from "@/features/base/types";
import { formatKtMph, nmToKm } from "@/lib/format/units";
import {
  CycloneFeatureLabel,
  ForecastRowLabel,
  type CycloneForecastPointData,
} from "./types";
import { CycloneForecastTickerContent } from "./ui/CycloneForecastTickerContent";

// Feature entry for the synthetic Domain.CyclonesForecast points. Needed so
// featureRegistry.get(type) resolves for the hit-test/detail pipeline.
// Minimal: forecast points piggyback on the cyclones layer toggle.

export const cycloneForecastFeature: FeatureDefinition<
  CycloneForecastPointData,
  Record<string, never>,
  Domain.CyclonesForecast
> = {
  id: Domain.CyclonesForecast,
  label: CycloneFeatureLabel.Forecast,
  icon: Wind,
  iconProps: STROKED_ICON_PROPS,
  TickerContent: CycloneForecastTickerContent,

  buildDetailRows: (data: CycloneForecastPointData) => {
    const pressureRow: [string, string][] =
      data.minPressureMb == null
        ? []
        : [[ForecastRowLabel.Pressure, `${data.minPressureMb} mb`]];
    return [
      [ForecastRowLabel.Storm, data.parentName],
      [ForecastRowLabel.Basin, data.parentBasin],
      [ForecastRowLabel.Forecast, `+${data.fcstHour}h`],
      [ForecastRowLabel.Winds, formatKtMph(data.maxWindKt)],
      ...pressureRow,
      [ForecastRowLabel.Class, data.category],
      [
        ForecastRowLabel.TrackError,
        `${data.errorRadiusNm} nm (${nmToKm(data.errorRadiusNm)} km)`,
      ],
    ];
  },

  getSearchText: (data: CycloneForecastPointData) =>
    `${data.parentName} +${data.fcstHour}h forecast`,
};
