import {
  AgeStyle,
  formatTimestamp,
  relativeAge,
} from "@/time";
import { IntelSeverity } from "@shared/domain/correlation";
import { EventFieldLabel } from "./formatters";
import type { EventData } from "./types";
import { eventToneLabel } from "./utils";

function toneLabel(tone: number): string {
  return `${tone.toFixed(1)} ${eventToneLabel(tone).toUpperCase()}`;
}

export function buildEventDetailRows(
  data: EventData,
  timestamp?: string,
): [string, string][] {
  const rows: [string, string][] = [];

  if (data.headline) {
    rows.push([EventFieldLabel.Headline, data.headline]);
  }

  if (data.category) {
    rows.push([EventFieldLabel.Category, data.category]);
  }

  if (data.severity != null) {
    rows.push([
      EventFieldLabel.Severity,
      "\u2588".repeat(data.severity) +
        "\u2591".repeat(IntelSeverity.Crisis - data.severity),
    ]);
  }

  if (data.tone != null) {
    rows.push([EventFieldLabel.Tone, toneLabel(data.tone)]);
  }

  if (data.source) {
    rows.push([EventFieldLabel.Source, data.source]);
  }

  if (data.sourceCountry) {
    rows.push([EventFieldLabel.Origin, data.sourceCountry]);
  }

  if (data.language) {
    rows.push([EventFieldLabel.Language, data.language.toUpperCase()]);
  }

  if (data.locationName) {
    rows.push([EventFieldLabel.Location, data.locationName]);
  }

  if (data.snippet) {
    rows.push([EventFieldLabel.Context, data.snippet]);
  }

  if (timestamp) {
    const ts = new Date(timestamp).getTime();
    rows.push([
      EventFieldLabel.Time,
      `${formatTimestamp(timestamp)} (${relativeAge(ts, AgeStyle.Verbose)})`,
    ]);
  }

  if (data.url) {
    rows.push([EventFieldLabel.Article, data.url]);
  }

  return rows;
}
