import { IntelSeverity, parseIntelSeverity } from "@shared/domain/correlation";
import { EMPTY_TEXT, SEMICOLON_SEPARATOR } from "@shared/text";
import {
  FeatureTableAbbreviation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";
import {
  type WeatherData,
  type WeatherSeverity,
  weatherSeverityRank,
} from "@shared/domain/weather";

export enum WeatherCopy {
  Alert = "Weather Alert",
  DefaultSender = "NWS",
  TickerAlert = "Weather alert",
}

export function weatherSeverityLabel(severity: WeatherSeverity): string {
  return severity.toUpperCase();
}

export function primaryWeatherArea(area: string | undefined): string {
  return area?.split(SEMICOLON_SEPARATOR)[0]?.trim() ?? EMPTY_TEXT;
}

export function weatherTablePresentation(
  data: WeatherData,
  _id: string,
): FeatureTablePresentation {
  return {
    abbreviation: FeatureTableAbbreviation.Weather,
    classification: data.severity,
    classificationRank: weatherSeverityRank(data.severity),
    detail: primaryWeatherArea(data.areaDesc),
    detailRank: 0,
    name: data.event || data.headline || WeatherCopy.Alert,
  };
}

export function weatherFeedPresentation(
  data: WeatherData,
  _id: string,
): FeatureFeedPresentation {
  return {
    category: data.severity,
    headline: data.event || data.headline || WeatherCopy.Alert,
    location: primaryWeatherArea(data.areaDesc),
    severity: parseIntelSeverity(
      weatherSeverityRank(data.severity) + IntelSeverity.Monitoring,
    ),
    source: data.senderName || WeatherCopy.DefaultSender,
    url: null,
  };
}
