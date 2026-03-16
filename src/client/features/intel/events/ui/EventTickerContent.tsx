import type { EventData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";

export function EventTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as EventData;
  return (
    <div className="leading-snug overflow-hidden text-ellipsis whitespace-nowrap text-sig-text text-[length:var(--sig-text-lg)]">
      {d.headline ?? ""}
    </div>
  );
}
