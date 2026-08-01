import type { WeatherData } from "../types";
import type { TickerRendererProps } from "@/features/base/presentation";
import { WeatherCopy, primaryWeatherArea } from "../formatters";

export function WeatherTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as WeatherData;
  return (
    <div className="leading-snug overflow-hidden">
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-text text-(length:--sig-text-lg)">
        {d.event ?? WeatherCopy.Alert}
      </div>
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-dim text-(length:--sig-text-sm)">
        {d.severity ?? ""}
        {d.areaDesc ? ` · ${primaryWeatherArea(d.areaDesc)}` : ""}
      </div>
    </div>
  );
}
