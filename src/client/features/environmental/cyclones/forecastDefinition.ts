import { Wind } from "lucide-react";
import type { FeatureDefinition, BasePoint } from "@/features/base/types";
import type { CycloneForecastPointData } from "./types";

// ── Forecast-point feature definition ────────────────────────────
// Synthetic per-forecast-point variant of the cyclones feature. The
// hit-test pipeline (DetailPanel, DataContext.filteredIds via the
// second-pass parent-storm propagation, etc.) calls
// featureRegistry.get(item.type) — without an entry for
// "cyclones-forecast" those callers return null/skip the item.
// This definition is intentionally minimal: forecast points piggyback
// on the cyclones layer toggle and inherit visibility from their
// parent storm; there is no separate filter UI.

const KT_TO_MPH = 1.15078;
const NM_TO_KM = 1.852;

export const cycloneForecastFeature: FeatureDefinition<
  CycloneForecastPointData,
  Record<string, never>
> = {
  id: "cyclones-forecast",
  label: "CYCLONE FORECAST",
  icon: Wind,
  iconProps: { strokeWidth: 2.5 },

  // No standalone filter — DataContext.filteredIds adds forecast points
  // based on parent storm filter status. The base filter pass calls
  // matchesFilter only when filters[type] != null, and we never set a
  // filter for "cyclones-forecast", so this never runs in practice.
  matchesFilter: () => true,
  defaultFilter: {} as Record<string, never>,

  // [label, value] tuples to match the FeatureDefinition contract
  // (consumed by DetailPanel.tsx — see PanelBody, which destructures
  // each row with [k, v]). Objects with {label, value} crash the
  // destructure with "object is not iterable".
  // [label, value] tuples to match the FeatureDefinition contract
  // (consumed by DetailPanel.tsx — see PanelBody, which destructures
  // each row with [k, v]). Objects with {label, value} crash the
  // destructure with "object is not iterable".
  buildDetailRows: (data: CycloneForecastPointData) => {
    const pressureRow: [string, string][] =
      data.minPressureMb == null
        ? []
        : [["PRESSURE", `${data.minPressureMb} mb`]];
    return [
      ["STORM", data.parentName],
      ["BASIN", data.parentBasin],
      ["FORECAST", `+${data.fcstHour}h`],
      [
        "WINDS",
        `${data.maxWindKt} kn (${Math.round(data.maxWindKt * KT_TO_MPH)} mph)`,
      ],
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
