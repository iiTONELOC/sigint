import type { CycloneForecastPointData } from "@shared/domain/cyclones";
import { TickerContentShell, type TickerRendererProps } from "@/features/base";
import { formatKtShort } from "@/measurements";
import { leadTime } from "../forecastDefinition";

export function CycloneForecastTickerContent({
  data,
}: Readonly<TickerRendererProps>) {
  const d = data as CycloneForecastPointData;
  return (
    <TickerContentShell
      primary={d.parentName}
      secondary={`${leadTime(d.fcstHour)} · ${formatKtShort(d.maxWindKt)}`}
    />
  );
}
