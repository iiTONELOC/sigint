import type { FireData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";

export function FireTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as FireData;
  const frpLabel = d.frp != null && d.frp > 0 ? `${d.frp.toFixed(1)} MW` : "";
  const confLabel = d.confidence ? d.confidence.toUpperCase() : "";

  return (
    <div className="leading-snug overflow-hidden">
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-text text-[length:var(--sig-text-lg)]">
        {frpLabel ? `FRP ${frpLabel}` : "Fire hotspot"}
        {confLabel ? ` · ${confLabel}` : ""}
      </div>
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-dim text-[length:var(--sig-text-sm)]">
        {d.satellite ?? "VIIRS"}
        {d.daynight ? ` · ${d.daynight === "D" ? "Day" : "Night"}` : ""}
        {d.brightness ? ` · ${d.brightness.toFixed(0)}K` : ""}
      </div>
    </div>
  );
}
