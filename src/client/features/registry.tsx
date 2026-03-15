import { Anchor, Zap } from "lucide-react";
import type {
  FeatureDefinition,
  TickerRendererProps,
  BasePoint,
} from "./base/types";
import type { ShipData, EventData } from "./base/dataPoints";
import { aircraftFeature } from "./tracking/aircraft";
import { earthquakeFeature } from "./environmental/earthquake";

// ── Default ticker content for simple features ───────────────────────

function ShipTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as ShipData;
  return (
    <div className="leading-snug overflow-hidden text-ellipsis whitespace-nowrap text-sig-text text-[length:var(--sig-text-lg)]">
      {d.name} [{d.flag}] {d.speed}kn
    </div>
  );
}

function EventTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as EventData;
  return (
    <div className="leading-snug overflow-hidden text-ellipsis whitespace-nowrap text-sig-text text-[length:var(--sig-text-lg)]">
      {d.headline ?? ""}
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

// ── Simple feature definitions ───────────────────────────────────────

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

// ── Registry ─────────────────────────────────────────────────────────

const features: FeatureDefinition<any, any>[] = [
  aircraftFeature,
  shipsFeature,
  eventsFeature,
  earthquakeFeature,
];

export const featureRegistry = new Map<string, FeatureDefinition<any, any>>(
  features.map((f) => [f.id, f]),
);

export const featureList = features;
