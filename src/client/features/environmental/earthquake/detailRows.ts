import { relativeAge } from "@/lib/timeFormat";
import type { EarthquakeData } from "./types";

export function buildEarthquakeDetailRows(
  data: EarthquakeData,
  timestamp?: string,
): [string, string][] {
  const rows: [string, string][] = [];

  if (data.magnitude != null) {
    rows.push(["Magnitude", `M${data.magnitude} ${data.magType ?? ""}`.trim()]);
  }

  if (data.depth != null) {
    rows.push(["Depth", `${data.depth.toFixed(1)} km`]);
  }

  if (data.location) {
    rows.push(["Location", data.location]);
  }

  if (data.felt != null && data.felt > 0) {
    rows.push(["Felt", `${data.felt} report${data.felt !== 1 ? "s" : ""}`]);
  }

  if (data.tsunami) {
    rows.push(["Tsunami", "WARNING"]);
  }

  if (data.alert) {
    rows.push(["Alert", data.alert.toUpperCase()]);
  }

  if (data.significance != null) {
    rows.push(["Significance", `${data.significance}`]);
  }

  if (data.status) {
    rows.push(["Status", data.status.toUpperCase()]);
  }

  if (data.eventType) {
    rows.push(["Type", data.eventType]);
  }

  if (timestamp) {
    const ts = new Date(timestamp).getTime();
    const dateStr = new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    rows.push(["Time", `${dateStr} (${relativeAge(ts, "verbose")})`]);
  }

  // ── Intel links ─────────────────────────────────────────────────
  if (data.url) {
    rows.push(["USGS", data.url]);
  }

  return rows;
}
