import type { ShipData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";

export function ShipTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as ShipData;
  return (
    <div className="leading-snug overflow-hidden text-ellipsis whitespace-nowrap text-sig-text text-[length:var(--sig-text-lg)]">
      {d.name} [{d.flag}] {d.speed}kn
    </div>
  );
}
