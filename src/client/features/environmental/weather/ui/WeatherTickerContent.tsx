import type { WeatherData } from "@shared/domain/weather";
import {
  TickerContentShell,
  type TickerRendererProps,
} from "@/features/base";
import { WeatherCopy, primaryWeatherArea } from "../formatters/presentation";

export function WeatherTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as WeatherData;
  return (
    <TickerContentShell
      primary={d.event ?? WeatherCopy.Alert}
      secondary={`${d.severity ?? ""}${
        d.areaDesc ? ` · ${primaryWeatherArea(d.areaDesc)}` : ""
      }`}
    />
  );
}
