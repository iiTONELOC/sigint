import { Domain } from "@shared/domain/identity";
import type { EarthquakeData } from "@shared/domain/earthquakes";
import { earthquakeSearchText } from "./data/uiQueries";
import { Activity } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import { EarthquakeTickerContent } from "./ui/EarthquakeTickerContent";
import { EarthquakeDetailSummary } from "./ui/EarthquakeDetailSummary";
import { EMPTY_TEXT } from "@shared/text";
import {
  EarthquakeCopy,
  earthquakeFeedPresentation,
  earthquakeTablePresentation,
} from "./formatters/presentation";

enum EarthquakeSummaryText {
  Fallback = "Quake",
}

function earthquakeSourceRows(data: EarthquakeData): [string, string][] {
  return data.url ? [[EarthquakeCopy.Source, data.url]] : [];
}

export const earthquakeFeature = defineFeature<
  EarthquakeData,
  Domain.Quakes
>({
  id: Domain.Quakes,
  label: "SEISMIC",
  icon: Activity,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Quakes,
  includeInRawFeed: true,
  DetailSummary: EarthquakeDetailSummary,

  alertDetail: (data) => [data.location || EMPTY_TEXT],
  buildDetailRows: earthquakeSourceRows,
  tablePresentation: earthquakeTablePresentation,
  feedPresentation: earthquakeFeedPresentation,

  TickerContent: EarthquakeTickerContent,
  tickerSummary: (data) => {
    const summary = [data.location || EarthquakeSummaryText.Fallback];
    if (data.magnitude != null) summary.push(`M${data.magnitude}`);
    return summary;
  },

  getSearchText: earthquakeSearchText,
  searchPresentation: (data, id) => {
    const presentation = earthquakeTablePresentation(data, id);
    return {
      primary: presentation.name,
      secondary: presentation.classification,
    };
  },
});
