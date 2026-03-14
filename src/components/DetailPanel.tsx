import {
  getSquawkStatus,
  getSquawkStatusLabel,
} from "@/lib/aircraft/aircraftUtils";
import { LAYER_TYPES } from "@/config/theme";
import { useTheme } from "@/context/ThemeContext";
import type { DataPoint } from "@/domain/providers/base/types";
import type { AircraftData } from "@/domain/providers/aircraft/aircraftTypes";
import { mono, FONT_SM, FONT_MD, FONT_LG, FONT_BTN } from "@/components/styles";

function buildAircraftRows(data: AircraftData): [string, string][] {
  const {
    squawk,
    acType,
    speedMps,
    onGround,
    operator,
    verticalRate,
    operatorIcao,
    speed = 0,
    heading = 0,
    altitude = 0,
    model = "UNKNOWN",
    icao24 = "UNKNOWN",
    callsign = "UNKNOWN",
    registration = "UNKNOWN",
    originCountry = "UNK ORIGIN",
    manufacturerName = "UNKNOWN",
    categoryDescription = "UNKNOWN",
  } = data;

  const aircraftType =
    acType ||
    [manufacturerName, model].filter(Boolean).join(" ") ||
    categoryDescription ||
    "Unknown";

  const speedMph = Math.round(speed * 1.15078);
  const speedLine =
    typeof speedMps === "number"
      ? `${speed} kn (${speedMph} mph)`
      : `${speed} kn`;

  const fl = altitude > 0 ? `${altitude} ft` : "GND";

  const rows: [string, string][] = [
    ["Callsign", callsign],
    ["ICAO24", icao24],
    ["Type", aircraftType],
    ["Reg", registration],
    ["Operator", operator || operatorIcao || "UNK OP"],
    ["Manufacturer", manufacturerName],
    ["Model", model],
    ["Category", categoryDescription],
    ["Origin", originCountry],
    ["Altitude", fl],
    ["Speed", speedLine],
    ["Heading", `${heading}\u00B0`],
  ];

  if (verticalRate != null) {
    rows.push(["V/S", `${Math.round(verticalRate * 196.85)} fpm`]);
  }

  rows.push(["Status", onGround ? "ON GROUND" : "AIRBORNE"]);

  if (squawk) {
    const status = getSquawkStatusLabel(getSquawkStatus(squawk));
    rows.push(["Squawk", `${squawk} \u2014 ${status}`]);
  }

  return rows;
}

// ── Row builders for other types ──────────────────────────────────────

function buildShipRows(data: any): [string, string][] {
  return [
    ["Vessel", data.name || ""],
    ["Type", data.vesselType || ""],
    ["Flag", data.flag || ""],
    ["Speed", `${data.speed} kn`],
    ["Heading", `${data.heading}\u00B0`],
  ];
}

function buildEventRows(data: any, timestamp?: string): [string, string][] {
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

function buildQuakeRows(data: any, timestamp?: string): [string, string][] {
  return [
    ["Magnitude", `M${data.magnitude}`],
    ["Depth", `${data.depth} km`],
    ["Location", data.location || ""],
    ["Time", timestamp ? new Date(timestamp).toLocaleTimeString() : ""],
  ];
}

function getRows(item: DataPoint): [string, string][] {
  const data = (item as any).data ?? {};
  switch (item.type) {
    case "aircraft":
      return buildAircraftRows(data);
    case "ships":
      return buildShipRows(data);
    case "events":
      return buildEventRows(data, item.timestamp);
    case "quakes":
      return buildQuakeRows(data, item.timestamp);
    default:
      return [];
  }
}

export type DetailPanelProps = {
  readonly item: DataPoint | null;
  readonly onClose: () => void;
};

const colorMap = (C: any): Record<string, string> => ({
  ships: C.ships,
  aircraft: C.aircraft,
  events: C.events,
  quakes: C.quakes,
});

export function DetailPanel({ item, onClose }: DetailPanelProps) {
  const { theme } = useTheme();
  const C = theme.colors;

  if (!item) return null;

  const layerCfg = LAYER_TYPES[item.type];
  const color = colorMap(C)[item.type];
  const rows = getRows(item);

  return (
    <div
      className="absolute right-3.5 top-3.5 w-64 rounded-md backdrop-blur-sm z-30"
      style={{
        background: `${C.panel}f0`,
        border: `1px solid ${C.border}`,
        padding: 14,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: "clamp(14px, 2vw, 18px)" }}>
            {layerCfg.icon}
          </span>
          <span
            className="font-bold tracking-widest"
            style={mono(color ?? C.text, FONT_BTN)}
          >
            {layerCfg.label}
          </span>
        </div>
        <span
          onClick={onClose}
          className="cursor-pointer text-[15px] leading-none select-none"
          style={{ color: C.dim }}
        >
          ✕
        </span>
      </div>

      {/* Rows */}
      <div className="pt-2.5" style={{ borderTop: `1px solid ${C.border}` }}>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between mb-1.5">
            <span
              className="uppercase tracking-wide"
              style={mono(C.dim, FONT_SM)}
            >
              {k}
            </span>
            <span
              className="text-right max-w-38.75 wrap-break-word"
              style={mono(C.bright, FONT_LG)}
            >
              {v}
            </span>
          </div>
        ))}
      </div>

      {/* Coordinates */}
      <div
        className="mt-1.5 pt-1.5"
        style={{
          borderTop: `1px solid ${C.border}`,
          ...mono(C.dim, FONT_MD),
        }}
      >
        {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
        {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
      </div>
    </div>
  );
}
