import type { EventData } from "./types";

export function buildEventDetailRows(
  data: EventData,
  timestamp?: string,
): [string, string][] {
  return [
    ["Category", data.category || ""],
    ["Headline", data.headline || ""],
    ["Source", data.source || ""],
    [
      "Severity",
      "\u2588".repeat(data.severity || 0) +
        "\u2591".repeat(5 - (data.severity || 0)),
    ],
    ["Time", timestamp ? new Date(timestamp).toLocaleTimeString() : ""],
  ];
}
