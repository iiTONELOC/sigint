import type { CycloneData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";
import { formatKtShort } from "@/lib/format/units";

export function CycloneTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as CycloneData;
  const badge = d.saffirSimpson > 0 ? `CAT ${d.saffirSimpson}` : d.classification;
  return (
    <div className="leading-snug overflow-hidden">
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-text text-[length:var(--sig-text-lg)]">
        {d.name}
      </div>
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-dim text-[length:var(--sig-text-sm)]">
        {badge} · {formatKtShort(d.maxWindKt)}
      </div>
    </div>
  );
}
