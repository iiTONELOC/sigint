import type { AircraftData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";

export function AircraftTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as AircraftData;
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
  } = d;

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

  const milBadge = d.military ? " MIL" : "";

  return (
    <>
      <div className="leading-snug text-sig-text text-(length:--sig-text-md)">
        {callsign}
        {reg} {acType} {altitude}ft {speedText}
        {sq}{milBadge}
      </div>
      <div className="leading-snug text-sig-dim text-(length:--sig-text-sm)">
        {metaLine}
      </div>
      <div className="leading-snug text-sig-dim text-(length:--sig-text-sm)">
        {originCountry} • HDG {hdg} • {status}
      </div>
    </>
  );
}
