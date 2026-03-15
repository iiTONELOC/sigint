import type { EarthquakeData } from "../types";
import type { TickerRendererProps } from "@/features/base/types";

export function EarthquakeTickerContent({
  data,
}: Readonly<TickerRendererProps>) {
  const d = data as EarthquakeData;
  const mag = d.magnitude != null ? `M${d.magnitude}` : "M?";
  const depth = d.depth != null ? `${d.depth.toFixed(1)}km deep` : "";
  const tsunami = d.tsunami ? " \u26A0 TSUNAMI" : "";
  const alert = d.alert ? ` [${d.alert.toUpperCase()}]` : "";

  return (
    <>
      <div className="leading-snug text-sig-text text-(length:--sig-text-md)">
        {mag} {"\u2014"} {d.location ?? "Unknown location"}
        {tsunami}
        {alert}
      </div>
      <div className="leading-snug text-sig-dim text-(length:--sig-text-sm)">
        {depth}
        {d.felt != null && d.felt > 0 ? ` \u2022 Felt by ${d.felt}` : ""}
        {d.magType ? ` \u2022 ${d.magType}` : ""}
      </div>
    </>
  );
}
