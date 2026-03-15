import { Anchor, Zap, Activity } from "lucide-react";
import type { FeatureDefinition, TickerRendererProps } from "./base/types";
import type { ShipData, EventData, QuakeData } from "./base/dataPoints";
import { aircraftFeature } from "./aircraft";
import { mono, FONT_LG } from "@/components/styles";

// ── Default ticker content for simple features ───────────────────────

function ShipTickerContent({ data, textColor }: Readonly<TickerRendererProps>) {
  const d = data as ShipData;
  return (
    <div
      className="leading-snug overflow-hidden text-ellipsis whitespace-nowrap"
      style={mono(textColor, FONT_LG)}
    >
      {d.name} [{d.flag}] {d.speed}kn
    </div>
  );
}

function EventTickerContent({
  data,
  textColor,
}: Readonly<TickerRendererProps>) {
  const d = data as EventData;
  return (
    <div
      className="leading-snug overflow-hidden text-ellipsis whitespace-nowrap"
      style={mono(textColor, FONT_LG)}
    >
      {d.headline ?? ""}
    </div>
  );
}

function QuakeTickerContent({
  data,
  textColor,
}: Readonly<TickerRendererProps>) {
  const d = data as QuakeData;
  return (
    <div
      className="leading-snug overflow-hidden text-ellipsis whitespace-nowrap"
      style={mono(textColor, FONT_LG)}
    >
      M{d.magnitude} {"\u2014"} {d.location}
    </div>
  );
}

// ── Simple feature detail row builders ───────────────────────────────

function buildShipDetailRows(data: ShipData): [string, string][] {
  return [
    ["Vessel", data.name || ""],
    ["Type", data.vesselType || ""],
    ["Flag", data.flag || ""],
    ["Speed", `${data.speed} kn`],
    ["Heading", `${data.heading}\u00B0`],
  ];
}

function buildEventDetailRows(
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

function buildQuakeDetailRows(
  data: QuakeData,
  timestamp?: string,
): [string, string][] {
  return [
    ["Magnitude", `M${data.magnitude}`],
    ["Depth", `${data.depth} km`],
    ["Location", data.location || ""],
    ["Time", timestamp ? new Date(timestamp).toLocaleTimeString() : ""],
  ];
}

// ── Simple feature definitions ───────────────────────────────────────
// These don't have their own folders yet. When they get real providers,
// graduate them to features/ships/, features/events/, etc.

const shipsFeature: FeatureDefinition<ShipData, boolean> = {
  id: "ships",
  label: "AIS VESSELS",
  icon: Anchor,
  matchesFilter: (_item, enabled) => enabled,
  defaultFilter: true,
  buildDetailRows: (data) => buildShipDetailRows(data),
  TickerContent: ShipTickerContent,
  getSearchText: (data) =>
    [data.name, data.flag, data.vesselType].filter(Boolean).join(" "),
};

const eventsFeature: FeatureDefinition<EventData, boolean> = {
  id: "events",
  label: "GDELT EVENTS",
  icon: Zap,
  matchesFilter: (_item, enabled) => enabled,
  defaultFilter: true,
  buildDetailRows: (data, ts) => buildEventDetailRows(data, ts),
  TickerContent: EventTickerContent,
  getSearchText: (data) =>
    [data.headline, data.category, data.source].filter(Boolean).join(" "),
};

const quakesFeature: FeatureDefinition<QuakeData, boolean> = {
  id: "quakes",
  label: "SEISMIC",
  icon: Activity,
  matchesFilter: (_item, enabled) => enabled,
  defaultFilter: true,
  buildDetailRows: (data, ts) => buildQuakeDetailRows(data, ts),
  TickerContent: QuakeTickerContent,
  getSearchText: (data) =>
    [data.location, data.magnitude != null ? `M${data.magnitude}` : ""]
      .filter(Boolean)
      .join(" "),
};

// ── Registry ─────────────────────────────────────────────────────────
// Adding a new data source? Register it here.

const features: FeatureDefinition<any, any>[] = [
  aircraftFeature,
  shipsFeature,
  eventsFeature,
  quakesFeature,
];

/** Map keyed by feature id for O(1) lookup */
export const featureRegistry = new Map<string, FeatureDefinition<any, any>>(
  features.map((f) => [f.id, f]),
);

/** Ordered list for iteration (UI rendering order) */
export const featureList = features;
