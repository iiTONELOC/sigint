import {
  AgeStyle,
  formatTimestamp,
  relativeAge,
} from "@/lib/format/timeFormat";
import { rampBand, type Band } from "@/lib/format/rampLookup";
import type { EventData } from "./types";

const TONE_LABEL_BANDS: ReadonlyArray<Band<string>> = [
  { max: -15, value: "VERY NEGATIVE" },
  { max: -5, value: "NEGATIVE" },
  { max: -1, value: "SLIGHTLY NEGATIVE" },
  { max: 1, value: "NEUTRAL" },
  { max: 5, value: "SLIGHTLY POSITIVE" },
];

function toneLabel(tone: number): string {
  return `${tone.toFixed(1)} ${rampBand(tone, TONE_LABEL_BANDS, "POSITIVE")}`;
}

export function buildEventDetailRows(
  data: EventData,
  timestamp?: string,
): [string, string][] {
  const rows: [string, string][] = [];

  if (data.headline) {
    rows.push(["Headline", data.headline]);
  }

  if (data.category) {
    rows.push(["Category", data.category]);
  }

  if (data.severity != null) {
    rows.push([
      "Severity",
      "\u2588".repeat(data.severity) + "\u2591".repeat(5 - data.severity),
    ]);
  }

  if (data.tone != null) {
    rows.push(["Tone", toneLabel(data.tone)]);
  }

  if (data.source) {
    rows.push(["Source", data.source]);
  }

  if (data.sourceCountry) {
    rows.push(["Origin", data.sourceCountry]);
  }

  if (data.language) {
    rows.push(["Language", data.language.toUpperCase()]);
  }

  if (data.locationName) {
    rows.push(["Location", data.locationName]);
  }

  if (data.snippet) {
    rows.push(["Context", data.snippet]);
  }

  if (timestamp) {
    const ts = new Date(timestamp).getTime();
    rows.push([
      "Time",
      `${formatTimestamp(timestamp)} (${relativeAge(ts, AgeStyle.Verbose)})`,
    ]);
  }

  // ── Intel links ─────────────────────────────────────────────────
  if (data.url) {
    rows.push(["Article", data.url]);
  }

  return rows;
}
