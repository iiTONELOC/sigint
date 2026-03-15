import type { AircraftData } from "./types";
import type { TickerRendererProps } from "@/features/base/types";
import { mono, FONT_SM, FONT_MD } from "@/components/styles";

export function AircraftTickerContent({
  data,
  textColor,
  dimColor,
}: Readonly<TickerRendererProps>) {
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
