import {
  AisHeading,
  ShipDataLabel,
  type ShipData,
} from "../types";
import type { TickerRendererProps } from "@/features/base/types";
import { formatKtShort } from "@/measurements";

enum ShipTickerClassName {
  DimLine = "leading-snug text-sig-dim text-(length:--sig-text-sm)",
}

export function ShipTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as ShipData;
  const label = d.name ||
    (d.mmsi ? `MMSI ${d.mmsi}` : ShipDataLabel.Unknown);
  const type =
    d.vesselType && d.vesselType !== ShipDataLabel.Unknown
      ? d.vesselType
      : "";

  const speedText =
    d.speed != null && d.speed > 0
      ? formatKtShort(d.speed)
      : "0kn";

  const hdg =
    d.heading != null && d.heading < AisHeading.Unavailable
      ? `${d.heading}°`
      : "---";

  const navStatus =
    d.navStatusLabel &&
    d.navStatusLabel !== ShipDataLabel.NavigationUndefined
      ? d.navStatusLabel
      : "";

  const dest = d.destination ? `→ ${d.destination}` : "";
  const mmsiLabel = d.mmsi ? `MMSI ${d.mmsi}` : "";
  const callLabel = d.callSign ? d.callSign : "";

  const metaParts = [navStatus, dest].filter(Boolean).join(" ");
  const idParts = [callLabel, mmsiLabel].filter(Boolean).join(" · ");

  return (
    <>
      <div className="leading-snug text-sig-text text-(length:--sig-text-md)">
        {label} {type} {speedText}
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
