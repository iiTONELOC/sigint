import { useState, useEffect, useMemo } from "react";
import { LAYER_TYPES } from "@/config/theme";
import { useTheme } from "@/context/ThemeContext";
import { mono, FONT_SM, FONT_MD, FONT_LG } from "./styles";
import type { DataPoint } from "@/domain/providers/base/types";
import type { AircraftData } from "@/domain/providers/aircraft/aircraftTypes";

function AircraftTickerContent({
  data,
  textColor,
  dimColor,
}: Readonly<{
  data: AircraftData;
  textColor: string;
  dimColor: string;
}>) {
  const {
    model,
    squawk,
    heading,
    speedMps,
    onGround,
    operator,
    registration,
    operatorIcao,
    manufacturerName,
    categoryDescription,
    speed = 0,
    altitude = 0,
    callsign = "UNK",
    acType = "Unknown",
    originCountry = "UNK ORIGIN",
  } = data;

  const sq = squawk ? ` SQ${squawk}` : "";
  const reg = registration ? ` ${registration}` : "";

  const speedText =
    typeof speedMps === "number"
      ? `${speed}kn/${Math.round(speed * 1.15078)}mph`
      : `${speed}kn`;

  const opLabel = operator || operatorIcao || "UNK OP";
  const category = categoryDescription ? ` • ${categoryDescription}` : "";
  const mfgModel = [manufacturerName, model].filter(Boolean).join(" ").trim();

  const metaLine = mfgModel
    ? `${opLabel} • ${mfgModel}${category}`
    : `${opLabel}${category}`;

  const status = onGround ? "GROUND" : "AIRBORNE";
  const hdg = typeof heading === "number" ? `${heading}°` : "---";

  return (
    <>
      <div className="leading-snug" style={mono(textColor, FONT_MD)}>
        {callsign}
        {reg} {acType} {altitude}ft {speedText}
        {sq}
      </div>
      <div className="leading-snug" style={mono(dimColor, FONT_SM)}>
        {metaLine}
      </div>
      <div className="leading-snug" style={mono(dimColor, FONT_SM)}>
        {originCountry} • HDG {hdg} • {status}
      </div>
    </>
  );
}

// ── Default ticker line for non-aircraft types ────────────────────────

function DefaultTickerContent({
  item,
  textColor,
}: Readonly<{
  item: DataPoint;
  textColor: string;
}>) {
  const data = (item as any).data ?? {};

  const label = (() => {
    switch (item.type) {
      case "events":
        return data.headline ?? "";
      case "quakes":
        return `M${data.magnitude} \u2014 ${data.location}`;
      case "ships":
        return `${data.name} [${data.flag}] ${data.speed}kn`;
      default:
        return "";
    }
  })();

  return (
    <div
      className="leading-snug overflow-hidden text-ellipsis whitespace-nowrap"
      style={mono(textColor, FONT_LG)}
    >
      {label}
    </div>
  );
}

// ── Ticker ────────────────────────────────────────────────────────────

type TickerProps = {
  readonly items: DataPoint[];
};

const TICKER_INTERVAL_MS = 6500;
const VISIBLE_COUNT = 3;

export function Ticker({ items }: Readonly<TickerProps>) {
  const [idx, setIdx] = useState(0);
  const { theme } = useTheme();
  const C = theme.colors;

  useEffect(() => {
    const iv = setInterval(() => setIdx((i) => i + 1), TICKER_INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);

  const colorMap: Record<string, string> = useMemo(
    () => ({
      ships: C.ships,
      aircraft: C.aircraft,
      events: C.events,
      quakes: C.quakes,
    }),
    [C],
  );

  const visible = useMemo(() => {
    if (items.length === 0) return [];
    return Array.from(
      { length: VISIBLE_COUNT },
      (_, i) => items[(idx + i) % items.length]!,
    );
  }, [items, idx]);

  return (
    <div className="flex gap-2 overflow-hidden">
      {visible.map((item, i) => {
        if (!item) return null;
        const layerCfg = LAYER_TYPES[item.type];
        const color = colorMap[item.type];
        const data = (item as any).data ?? {};

        return (
          <div
            key={`${item.id}-${idx}-${i}`}
            className="flex-1 min-w-0 rounded"
            style={{
              padding: "6px 10px",
              background: `${C.panel}cc`,
              border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${color}`,
              minHeight: 68,
            }}
          >
            <div className="flex justify-between mb-0.5">
              <span
                className="tracking-wider"
                style={mono(color as string, FONT_MD)}
              >
                {layerCfg.icon} {layerCfg.label}
              </span>
              <span style={mono(C.dim, FONT_SM)}>
                {item.timestamp
                  ? new Date(item.timestamp).toLocaleTimeString()
                  : "LIVE"}
              </span>
            </div>

            {item.type === "aircraft" ? (
              <AircraftTickerContent
                data={data}
                textColor={C.text}
                dimColor={C.dim}
              />
            ) : (
              <DefaultTickerContent item={item} textColor={C.text} />
            )}
          </div>
        );
      })}
    </div>
  );
}
