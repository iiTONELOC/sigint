import { Domain } from "@shared/domain/identity";
import { Wind } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import { formatKtMph, formatNauticalMiles } from "@/measurements";
import {
  cycloneFeedPresentation,
  cycloneTablePresentation,
} from "./formatters/presentation";
import { formatPressureMb } from "./formatters/units";
import {
  CYCLONE_CATEGORY_METADATA,
  type CycloneForecastPointData,
} from "@shared/domain/cyclones";
import { BASIN_LABEL } from "@shared/cyclonesSeason";
import { CycloneForecastTickerContent } from "./ui/CycloneForecastTickerContent";
import { BLANK_SEPARATOR } from "@shared/text";

enum CycloneForecastText {
  SearchSuffix = "forecast",
  LeadTimePrefix = "+",
  HourSuffix = "h",
  NotIssued = "not issued",
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

export const NOW_LABEL = "NOW";

export function trackErrorText(errorRadiusNm: number): string {
  return errorRadiusNm > 0 ? formatNauticalMiles(errorRadiusNm) : CycloneForecastText.NotIssued;
}

/** Lead time as the dossier writes it: `+24h`. */
export function leadTime(fcstHour: number): string {
  return `${CycloneForecastText.LeadTimePrefix}${fcstHour}${CycloneForecastText.HourSuffix}`;
}

export function forecastPointName(data: CycloneForecastPointData): string {
  return `${data.parentName}${BLANK_SEPARATOR}${leadTime(data.fcstHour)}`;
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
      [CycloneForecastRowLabel.Basin, BASIN_LABEL[data.parentBasin]],
      [CycloneForecastRowLabel.Forecast, leadTime(data.fcstHour)],
      [CycloneForecastRowLabel.Winds, formatKtMph(data.maxWindKt)],
      ...pressureRow,
      [CycloneForecastRowLabel.Class, CYCLONE_CATEGORY_METADATA[data.category].label],
      [CycloneForecastRowLabel.TrackError, trackErrorText(data.errorRadiusNm)],
    ];
    return rows.map(([label, value]) => [label.toUpperCase(), value]);
  },
  tablePresentation: (data) =>
    cycloneTablePresentation(forecastPointName(data), Domain.CyclonesForecast),
  feedPresentation: (data) => cycloneFeedPresentation(forecastPointName(data)),

  getSearchText: (data: CycloneForecastPointData) =>
    `${data.parentName}${BLANK_SEPARATOR}${leadTime(data.fcstHour)}${BLANK_SEPARATOR}${CycloneForecastText.SearchSuffix}`,
});
