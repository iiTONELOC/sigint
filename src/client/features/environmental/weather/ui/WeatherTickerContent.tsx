import type { WeatherData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";

export function WeatherTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as WeatherData;
  return (
    <div className="leading-snug overflow-hidden">
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-text text-[length:var(--sig-text-lg)]">
        {d.event ?? "Weather Alert"}
      </div>
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-dim text-[length:var(--sig-text-sm)]">
        {d.severity ?? ""}
        {d.areaDesc ? ` · ${d.areaDesc.split(";")[0]?.trim()}` : ""}
      </div>
    </div>
  );
}
