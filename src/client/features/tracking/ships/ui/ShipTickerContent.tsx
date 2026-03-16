import type { ShipData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";

export function ShipTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as ShipData;
  const label = d.name || (d.mmsi ? `MMSI ${d.mmsi}` : "Unknown");
  const speed = d.speed != null ? `${d.speed}kn` : "";
  const type = d.vesselType && d.vesselType !== "Unknown" ? d.vesselType : "";
  const parts = [label, type, speed].filter(Boolean).join(" · ");

  return (
    <div className="leading-snug overflow-hidden text-ellipsis whitespace-nowrap text-sig-text text-[length:var(--sig-text-lg)]">
      {parts}
    </div>
  );
}
