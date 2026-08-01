import { Domain } from "@shared/domain/identity";
import { Wind } from "lucide-react";
import {
  STROKED_ICON_PROPS,
  type FeatureDefinition,
} from "@/features/base/types";
import { formatKtMph } from "@/measurements";
import { formatNmKm, formatPressureMb } from "./formatters";
import {
  CycloneFeatureLabel,
  CycloneRowLabel,
  type CycloneForecastPointData,
} from "./types";
import { CycloneForecastTickerContent } from "./ui/CycloneForecastTickerContent";
import { BLANK_SEPARATOR } from "@shared/text";

enum CycloneForecastText {
  SearchSuffix = "forecast",
  LeadTimePrefix = "+",
  HourSuffix = "h",
}

/** Lead time as the dossier writes it: `+24h`. */
export function leadTime(fcstHour: number): string {
  return `${CycloneForecastText.LeadTimePrefix}${fcstHour}${CycloneForecastText.HourSuffix}`;
}

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
    const pressureRow: [CycloneRowLabel, string][] =
      data.minPressureMb == null
        ? []
        : [[CycloneRowLabel.Pressure, formatPressureMb(data.minPressureMb)]];
    const rows: [CycloneRowLabel, string][] = [
      [CycloneRowLabel.Storm, data.parentName],
      [CycloneRowLabel.Basin, data.parentBasin],
      [CycloneRowLabel.Forecast, leadTime(data.fcstHour)],
      [CycloneRowLabel.Winds, formatKtMph(data.maxWindKt)],
      ...pressureRow,
      [CycloneRowLabel.Class, data.category],
      [CycloneRowLabel.TrackError, formatNmKm(data.errorRadiusNm)],
    ];
    return rows.map(([label, value]) => [label.toUpperCase(), value]);
  },

  getSearchText: (data: CycloneForecastPointData) =>
    `${data.parentName}${BLANK_SEPARATOR}${leadTime(data.fcstHour)}${BLANK_SEPARATOR}${CycloneForecastText.SearchSuffix}`,
};
