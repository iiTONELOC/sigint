import type { CycloneForecastPointData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";

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
        +{d.fcstHour}h · {d.maxWindKt} kn
      </div>
    </div>
  );
}
