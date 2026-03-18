import { relativeAge } from "@/lib/timeFormat";
import type { WeatherData } from "./types";

function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

export function buildWeatherDetailRows(
  data: WeatherData,
  timestamp?: string,
): [string, string][] {
  const rows: [string, string][] = [];

  if (data.event) {
    rows.push(["Event", data.event]);
  }

  if (data.severity) {
    rows.push(["Severity", data.severity.toUpperCase()]);
  }

  if (data.urgency) {
    rows.push(["Urgency", data.urgency]);
  }

  if (data.certainty) {
    rows.push(["Certainty", data.certainty]);
  }

  if (data.category) {
    rows.push(["Category", data.category]);
  }

  if (data.response) {
    rows.push(["Response", data.response]);
  }

  if (data.senderName) {
    rows.push(["Issuer", data.senderName]);
  }

  if (data.areaDesc) {
    rows.push(["Area", data.areaDesc]);
  }

  if (data.onset) {
    rows.push(["Onset", formatTime(data.onset)]);
  }

  if (data.expires) {
    rows.push(["Expires", formatTime(data.expires)]);
  }

  if (data.headline) {
    rows.push(["Headline", data.headline]);
  }

  if (timestamp) {
    const ts = new Date(timestamp).getTime();
    rows.push([
      "Issued",
      `${formatTime(timestamp)} (${relativeAge(ts, "verbose")})`,
    ]);
  }

  return rows;
}
