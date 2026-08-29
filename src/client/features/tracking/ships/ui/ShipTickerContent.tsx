import {
  AIS_HEADING_UNAVAILABLE,
  AisNavigationStatus,
  SHIP_UNKNOWN_LABEL,
  type ShipData,
} from "@shared/domain/ships";
import { EMPTY_TEXT } from "@shared/text";
import type { TickerRendererProps } from "@/features/base/presentation";
import { formatKtShort } from "@/measurements";
import { shipPresentation } from "../formatters/presentation";

enum ShipTickerClassName {
  DimLine = "leading-snug text-sig-dim text-(length:--sig-text-sm)",
}

export function ShipTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as ShipData;
  const presentation = shipPresentation(d, d.mmsi ? `MMSI ${d.mmsi}` : SHIP_UNKNOWN_LABEL);
  const type = presentation.vesselType ?? EMPTY_TEXT;

  const speedText =
    d.sog != null && d.sog > 0
      ? formatKtShort(d.sog)
      : "0kn";

  const hdg =
    d.heading != null && d.heading < AIS_HEADING_UNAVAILABLE
      ? `${d.heading}°`
      : "---";

  const navStatus = d.navStatus === undefined ||
    d.navStatus === AisNavigationStatus.NotDefined
    ? ""
    : presentation.navigation.fullLabel;

  const dest = d.destination ? `→ ${d.destination}` : "";
  const mmsiLabel = d.mmsi ? `MMSI ${d.mmsi}` : "";
  const callLabel = d.callSign ? d.callSign : "";

  const metaParts = [navStatus, dest].filter(Boolean).join(" ");
  const idParts = [callLabel, mmsiLabel].filter(Boolean).join(" · ");

  return (
    <>
      <div className="leading-snug text-sig-text text-(length:--sig-text-md)">
        {presentation.name} {type} {speedText}
      </div>
      {metaParts && (
        <div className={ShipTickerClassName.DimLine}>
          {metaParts}
        </div>
      )}
      <div className={ShipTickerClassName.DimLine}>
        {idParts}
        {idParts ? " • " : ""}
        HDG {hdg}
      </div>
    </>
  );
}
