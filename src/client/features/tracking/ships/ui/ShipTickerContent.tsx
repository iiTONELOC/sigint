import type { ShipData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";

export function ShipTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as ShipData;
  const label = d.name || (d.mmsi ? `MMSI ${d.mmsi}` : "Unknown");
  const type = d.vesselType && d.vesselType !== "Unknown" ? d.vesselType : "";

  const speedText =
    d.speed != null && d.speed > 0
      ? `${d.speed}kn/${Math.round(d.speed * 1.15078)}mph`
      : "0kn";

  const hdg = d.heading != null && d.heading < 511 ? `${d.heading}°` : "---";

  const navStatus =
    d.navStatusLabel && d.navStatusLabel !== "Not defined"
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
        <div className="leading-snug text-sig-dim text-(length:--sig-text-sm)">
          {metaParts}
        </div>
      )}
      <div className="leading-snug text-sig-dim text-(length:--sig-text-sm)">
        {idParts}
        {idParts ? " • " : ""}
        HDG {hdg}
      </div>
    </>
  );
}
