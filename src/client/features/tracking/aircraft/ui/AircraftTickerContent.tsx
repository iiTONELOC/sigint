import {
  AircraftDataLabel,
  AircraftFlightStatusLabel,
  type AircraftData,
} from "../types";
import type { TickerRendererProps } from "@/features/base/types";
import { formatKtShort } from "@/measurements";

enum AircraftTickerClassName {
  DimLine = "leading-snug text-sig-dim text-(length:--sig-text-sm)",
}

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
    callsign = AircraftDataLabel.UnknownCallsign,
    acType = AircraftDataLabel.Unknown,
    originCountry = AircraftDataLabel.UnknownOrigin,
  } = d;

  const sq = squawk ? ` SQ${squawk}` : "";
  const reg = registration ? ` ${registration}` : "";

  const speedText =
    typeof speedMps === "number"
      ? formatKtShort(speed)
      : `${speed}kn`;

  const opLabel = operator || operatorIcao || AircraftDataLabel.UnknownOperator;
  const category = categoryDescription ? ` • ${categoryDescription}` : "";
  const mfgModel = [manufacturerName, model].filter(Boolean).join(" ").trim();

  const metaLine = mfgModel
    ? `${opLabel} • ${mfgModel}${category}`
    : `${opLabel}${category}`;

  const status = onGround
    ? AircraftFlightStatusLabel.Ground
    : AircraftFlightStatusLabel.Airborne;
  const hdg = typeof heading === "number" ? `${heading}°` : "---";

  const milBadge = d.military ? " MIL" : "";

  return (
    <>
      <div className="leading-snug text-sig-text text-(length:--sig-text-md)">
        {callsign}
        {reg} {acType} {altitude}ft {speedText}
        {sq}{milBadge}
      </div>
      <div className={AircraftTickerClassName.DimLine}>
        {metaLine}
      </div>
      <div className={AircraftTickerClassName.DimLine}>
        {originCountry} • HDG {hdg} • {status}
      </div>
    </>
  );
}
