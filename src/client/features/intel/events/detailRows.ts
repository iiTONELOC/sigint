import type { EventData } from "./types";

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

function toneLabel(tone: number): string {
  if (tone <= -15) return `${tone.toFixed(1)} VERY NEGATIVE`;
  if (tone <= -5) return `${tone.toFixed(1)} NEGATIVE`;
  if (tone <= -1) return `${tone.toFixed(1)} SLIGHTLY NEGATIVE`;
  if (tone <= 1) return `${tone.toFixed(1)} NEUTRAL`;
  if (tone <= 5) return `${tone.toFixed(1)} SLIGHTLY POSITIVE`;
  return `${tone.toFixed(1)} POSITIVE`;
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
      "\u2588".repeat(data.severity) +
        "\u2591".repeat(5 - data.severity),
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
    rows.push(["Article", data.url]);
  }

  return rows;
}
