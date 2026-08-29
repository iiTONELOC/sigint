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
} from "./formatters/presentation";
import {
  formatNmKm,
  formatPressureMb,
} from "./formatters/units";
import {
  type CycloneForecastPointData,
} from "@shared/domain/cyclones";
import { CycloneForecastTickerContent } from "./ui/CycloneForecastTickerContent";
import { BLANK_SEPARATOR } from "@shared/text";

enum CycloneForecastText {
  SearchSuffix = "forecast",
  LeadTimePrefix = "+",
  HourSuffix = "h",
}

enum CycloneForecastRowLabel {
  Storm = "Storm",
  Basin = "Basin",
  Forecast = "Forecast",
  Winds = "Winds",
  Pressure = "Pressure",
  Class = "Class",
  TrackError = "Track error",
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
  label: "CYCLONE FORECAST",
  icon: Wind,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Cyclones,
  TickerContent: CycloneForecastTickerContent,

  buildDetailRows: (data: CycloneForecastPointData) => {
    const pressureRow: [CycloneForecastRowLabel, string][] =
      data.minPressureMb == null
        ? []
        : [[CycloneForecastRowLabel.Pressure, formatPressureMb(data.minPressureMb)]];
    const rows: [CycloneForecastRowLabel, string][] = [
      [CycloneForecastRowLabel.Storm, data.parentName],
      [CycloneForecastRowLabel.Basin, data.parentBasin],
      [CycloneForecastRowLabel.Forecast, leadTime(data.fcstHour)],
      [CycloneForecastRowLabel.Winds, formatKtMph(data.maxWindKt)],
      ...pressureRow,
      [CycloneForecastRowLabel.Class, data.category],
      [CycloneForecastRowLabel.TrackError, formatNmKm(data.errorRadiusNm)],
    ];
    return rows.map(([label, value]) => [label.toUpperCase(), value]);
  },
  tablePresentation: (_data, id) =>
    cycloneTablePresentation(id, Domain.CyclonesForecast),
  feedPresentation: (_data, id) => cycloneFeedPresentation(id),

  getSearchText: (data: CycloneForecastPointData) =>
    `${data.parentName}${BLANK_SEPARATOR}${leadTime(data.fcstHour)}${BLANK_SEPARATOR}${CycloneForecastText.SearchSuffix}`,
});
