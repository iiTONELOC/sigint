import type { WeatherData } from "./types";

function relativeAge(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h ago`;
}

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
    rows.push(["Issued", `${formatTime(timestamp)} (${relativeAge(ts)})`]);
  }

  return rows;
}
