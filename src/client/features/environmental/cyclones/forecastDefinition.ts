import { Wind } from "lucide-react";
import type { FeatureDefinition, BasePoint } from "@/features/base/types";
import { formatKtMph } from "@/lib/units";
import type { CycloneForecastPointData } from "./types";
import { CycloneForecastTickerContent } from "./ui/CycloneForecastTickerContent";

// Feature entry for the synthetic "cyclones-forecast" points. Needed so
// featureRegistry.get(type) resolves for the hit-test/detail pipeline.
// Minimal: forecast points piggyback on the cyclones layer toggle.

const NM_TO_KM = 1.852;

export const cycloneForecastFeature: FeatureDefinition<
  CycloneForecastPointData,
  Record<string, never>
> = {
  id: "cyclones-forecast",
  label: "CYCLONE FORECAST",
  icon: Wind,
  iconProps: { strokeWidth: 2.5 },
  TickerContent: CycloneForecastTickerContent,

  // No standalone filter — DataContext.filteredIds adds forecast points
  // based on parent storm filter status. The base filter pass calls
  // matchesFilter only when filters[type] != null, and we never set a
  // filter for "cyclones-forecast", so this never runs in practice.
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
        `${data.errorRadiusNm} nm (${Math.round(data.errorRadiusNm * NM_TO_KM)} km)`,
      ],
    ];
  },

  getSearchText: (data: CycloneForecastPointData) =>
    `${data.parentName} +${data.fcstHour}h forecast`,
};

// Type guard for use in the registry
export type ForecastBasePoint = BasePoint & { data: CycloneForecastPointData };
