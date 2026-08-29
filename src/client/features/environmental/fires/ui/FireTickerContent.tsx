import type { FireData } from "@shared/domain/fireDayNight";
import {
  TickerContentShell,
  type TickerRendererProps,
} from "@/features/base";
import { FireDayNight } from "@shared/domain/fireDayNight";
import { stringEnumMemberName } from "@shared/types/enum";
import { FireCopy, formatFirePower } from "../formatters/presentation";

export function FireTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as FireData;
  const frpLabel =
    d.frp != null && d.frp > 0 ? formatFirePower(d.frp) : "";
  const confLabel = d.confidence ? d.confidence.toUpperCase() : "";
  const dayNightLabel = stringEnumMemberName(d.daynight, FireDayNight);
  const primary = frpLabel
    ? `${FireCopy.RadiativePower} ${frpLabel}`
    : FireCopy.Hotspot;
  const confidence = confLabel ? ` · ${confLabel}` : "";
  const satellite = d.satellite ?? FireCopy.DefaultSatellite;
  const pass = dayNightLabel ? ` · ${dayNightLabel}` : "";
  const brightness = d.brightness
    ? ` · ${d.brightness.toFixed(0)}K`
    : "";

  return (
    <TickerContentShell
      primary={`${primary}${confidence}`}
      secondary={`${satellite}${pass}${brightness}`}
    />
  );
}
