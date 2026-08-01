import type { EventData } from "../types";
import type { TickerRendererProps } from "@/features/base/presentation";

enum EventTickerTonePrefix {
  Positive = "+",
}

function eventTickerTone(tone: number | undefined): string {
  if (tone == null) return "";
  const prefix = tone > 0 ? EventTickerTonePrefix.Positive : "";
  return ` · ${prefix}${tone.toFixed(1)}`;
}

export function EventTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as EventData;
  const tone = eventTickerTone(d.tone);
  return (
    <div className="leading-snug overflow-hidden">
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-text text-(length:--sig-text-lg)">
        {d.headline ?? ""}
      </div>
      {d.source && (
        <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-dim text-(length:--sig-text-sm)">
          {d.source}
          {d.sourceCountry ? ` · ${d.sourceCountry}` : ""}
          {tone}
        </div>
      )}
    </div>
  );
}
