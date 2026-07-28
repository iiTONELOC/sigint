import { Wind } from "lucide-react";
import type { FeatureDefinition, BasePoint } from "@/features/base/types";
import { formatKtMph, nmToKm } from "@/lib/format/units";
import type { CycloneForecastPointData } from "./types";
import { CycloneForecastTickerContent } from "./ui/CycloneForecastTickerContent";

// Feature entry for the synthetic "cyclones-forecast" points. Needed so
// featureRegistry.get(type) resolves for the hit-test/detail pipeline.
// Minimal: forecast points piggyback on the cyclones layer toggle.

export const cycloneForecastFeature: FeatureDefinition<
  CycloneForecastPointData,
  Record<string, never>,
  "cyclones-forecast"
> = {
  id: "cyclones-forecast",
  label: "CYCLONE FORECAST",
  icon: Wind,
  iconProps: { strokeWidth: 2.5 },
  TickerContent: CycloneForecastTickerContent,

  // No standalone filter. Forecast points follow their parent storm, and the
  // renderer applies that in its own filter pass. The derive walk calls
  // matchesFilter only when filters[type] != null, and no filter is ever set
  // for "cyclones-forecast", so this never runs in practice.
  matchesFilter: () => true,
  defaultFilter: {} as Record<string, never>,

  // Must be [label, value] tuples — DetailPanel destructures each as [k, v].
  buildDetailRows: (data: CycloneForecastPointData) => {
    const pressureRow: [string, string][] =
      data.minPressureMb == null
        ? []
        : [["PRESSURE", `${data.minPressureMb} mb`]];
    return [
      ["STORM", data.parentName],
      ["BASIN", data.parentBasin],
      ["FORECAST", `+${data.fcstHour}h`],
      ["WINDS", formatKtMph(data.maxWindKt)],
      ...pressureRow,
      ["CLASS", data.category],
      [
        "TRACK ERROR",
        `${data.errorRadiusNm} nm (${nmToKm(data.errorRadiusNm)} km)`,
      ],
    ];
  },

  getSearchText: (data: CycloneForecastPointData) =>
    `${data.parentName} +${data.fcstHour}h forecast`,
};

// Type guard for use in the registry
export type ForecastBasePoint = BasePoint & { data: CycloneForecastPointData };
