import { isEventData, type EventData } from "@shared/domain/events";
import {
  TickerContentShell,
  type TickerRendererProps,
} from "@/features/base";

enum EventTickerTonePrefix {
  Positive = "+",
}

function eventTickerTone(tone: number | undefined): string {
  if (tone == null) return "";
  const prefix = tone > 0 ? EventTickerTonePrefix.Positive : "";
  return ` · ${prefix}${tone.toFixed(1)}`;
}

export function EventTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d: EventData = isEventData(data) ? data : {};
  const source = d.source
    ? [d.source, d.sourceCountry].filter(Boolean).join(" · ")
    : null;
  const secondary = source ? `${source}${eventTickerTone(d.tone)}` : null;
  return (
    <TickerContentShell
      primary={d.headline ?? ""}
      secondary={secondary}
    />
  );
}
