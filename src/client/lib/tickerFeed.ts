import type { DataPoint } from "@/features/base/dataPoints";
import { featureRegistry } from "@/features/registry";

function stableOrder(items: DataPoint[]): DataPoint[] {
  return [...items].sort((a, b) => {
    // For aircraft, sort by callsign first for stability
    if (a.type === "aircraft" && b.type === "aircraft") {
      const aCs = ((a.data as any)?.callsign ?? "").trim();
      const bCs = ((b.data as any)?.callsign ?? "").trim();
      if (aCs && bCs && aCs !== bCs) return aCs.localeCompare(bCs);
    }
    return a.id.localeCompare(b.id);
  });
}

function isEmergencyAircraft(item: DataPoint): boolean {
  if (item.type !== "aircraft") return false;
  const sq = (item.data as any)?.squawk ?? "";
  return sq === "7700" || sq === "7600" || sq === "7500";
}

/**
 * Build ticker items from all data, applying each feature's own filter.
 *
 * @param allData     All data points from all providers
 * @param filters     Map of feature id → that feature's current filter state
 * @param layers      Map of feature id → on/off toggle (for simple features)
 */
export function buildTickerItems(
  allData: DataPoint[],
  filters: Record<string, unknown>,
  layers: Record<string, boolean>,
): DataPoint[] {
  // Separate aircraft from others — aircraft get priority + emergency sorting
  const aircraft: DataPoint[] = [];
  const nonAircraft: DataPoint[] = [];

  for (const item of allData) {
    const feature = featureRegistry.get(item.type);
    if (!feature) continue;

    if (item.type === "aircraft") {
      // Aircraft uses its own complex filter; ticker always uses { ...filter, enabled: true }
      const filter = filters[item.type];
      if (filter && feature.matchesFilter(item as any, { ...(filter as any), enabled: true })) {
        aircraft.push(item);
      }
    } else {
      // Simple features just check their layer toggle
      if (layers[item.type] ?? false) {
        nonAircraft.push(item);
      }
    }
  }

  const emergencyAircraft = aircraft.filter(isEmergencyAircraft);
  const normalAircraft = aircraft.filter((d) => !isEmergencyAircraft(d));

  const prioritizedAircraft = [
    ...emergencyAircraft,
    ...stableOrder(normalAircraft),
  ].slice(0, 24);

  if (prioritizedAircraft.length >= 20) {
    return prioritizedAircraft;
  }

  const remaining = Math.max(0, 24 - prioritizedAircraft.length);
  const supportItems = stableOrder(nonAircraft).slice(0, remaining);
  return [...prioritizedAircraft, ...supportItems];
}
