import type { EventData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";

export function EventTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as EventData;
  return (
    <div className="leading-snug overflow-hidden">
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-text text-[length:var(--sig-text-lg)]">
        {d.headline ?? ""}
      </div>
      {d.source && (
        <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-dim text-[length:var(--sig-text-sm)]">
          {d.source}
          {d.sourceCountry ? ` · ${d.sourceCountry}` : ""}
          {d.tone != null ? ` · ${d.tone > 0 ? "+" : ""}${d.tone.toFixed(1)}` : ""}
        </div>
      )}
    </div>
  );
}
