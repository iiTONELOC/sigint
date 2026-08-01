import type { FireData } from "../types";
import type { TickerRendererProps } from "@/features/base/presentation";
import { FireDayNight } from "@shared/domain/fireDayNight";
import { FireCopy, formatFirePower } from "../formatters";

function fireTickerDayNightLabel(
  value: string | undefined,
): string | null {
  if (value === FireDayNight.Day) return "Day";
  if (value === FireDayNight.Night) return "Night";
  return null;
}

export function FireTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as FireData;
  const frpLabel =
    d.frp != null && d.frp > 0 ? formatFirePower(d.frp) : "";
  const confLabel = d.confidence ? d.confidence.toUpperCase() : "";
  const dayNightLabel = fireTickerDayNightLabel(d.daynight);

  return (
    <div className="leading-snug overflow-hidden">
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-text text-(length:--sig-text-lg)">
        {frpLabel
          ? `${FireCopy.RadiativePower} ${frpLabel}`
          : FireCopy.Hotspot}
        {confLabel ? ` · ${confLabel}` : ""}
      </div>
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-dim text-(length:--sig-text-sm)">
        {d.satellite ?? FireCopy.DefaultSatellite}
        {dayNightLabel ? ` · ${dayNightLabel}` : ""}
        {d.brightness ? ` · ${d.brightness.toFixed(0)}K` : ""}
      </div>
    </div>
  );
}
