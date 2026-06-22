import type { CycloneForecastPointData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";
import { formatKtShort } from "@/lib/format/units";

export function CycloneForecastTickerContent({
  data,
}: Readonly<TickerRendererProps>) {
  const d = data as CycloneForecastPointData;
  return (
    <div className="leading-snug overflow-hidden">
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-text text-[length:var(--sig-text-lg)]">
        {d.parentName}
      </div>
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-dim text-[length:var(--sig-text-sm)]">
        +{d.fcstHour}h · {formatKtShort(d.maxWindKt)}
      </div>
    </div>
  );
}
