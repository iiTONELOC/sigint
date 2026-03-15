import type { EarthquakeData } from "./types";

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
    rows.push(["Time", `${dateStr} (${relativeAge(ts)})`]);
  }

  // ── Intel links ─────────────────────────────────────────────────
  if (data.url) {
    rows.push(["USGS", data.url]);
  }

  return rows;
}
