import { Domain } from "@shared/domain/identity";
import { Wind } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import { formatKtMph } from "@/measurements";
import {
  cycloneFeedPresentation,
  cycloneTablePresentation,
  formatNmKm,
  formatPressureMb,
} from "./formatters";
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

export const cycloneForecastFeature = defineFeature<
  CycloneForecastPointData,
  Domain.CyclonesForecast
>({
  id: Domain.CyclonesForecast,
  label: CycloneFeatureLabel.Forecast,
  icon: Wind,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Cyclones,
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
  tablePresentation: (_data, id) =>
    cycloneTablePresentation(id, Domain.CyclonesForecast),
  feedPresentation: (_data, id) => cycloneFeedPresentation(id),

  getSearchText: (data: CycloneForecastPointData) =>
    `${data.parentName}${BLANK_SEPARATOR}${leadTime(data.fcstHour)}${BLANK_SEPARATOR}${CycloneForecastText.SearchSuffix}`,
});
