import type { DataPoint, DataType } from "@/features/base/dataPoints";
import { featureRegistry } from "@/features/registry";

/**
 * Count visible entities per feature, applying each feature's own filter.
 */
export function selectLayerCounts(
  allData: DataPoint[],
  filters: Record<string, unknown>,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const [id] of featureRegistry) {
    counts[id] = 0;
  }

  for (const item of allData) {
    const feature = featureRegistry.get(item.type);
    if (!feature) continue;

    const filter = filters[item.type];
    if (filter != null && feature.matchesFilter(item as any, filter)) {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
    }
  }

  return counts;
}

/**
 * Total active (visible) tracks across all features.
 */
export function selectActiveCount(
  allData: DataPoint[],
  filters: Record<string, unknown>,
): number {
  let count = 0;
  for (const item of allData) {
    const feature = featureRegistry.get(item.type);
    if (!feature) continue;
    const filter = filters[item.type];
    if (filter != null && feature.matchesFilter(item as any, filter)) {
      count++;
    }
  }
  return count;
}

/**
 * Extract unique countries from aircraft data points, sorted by frequency.
 */
export function selectAvailableAircraftCountries(
  allData: DataPoint[],
): string[] {
  const counts = new Map<string, number>();
  allData.forEach((d) => {
    if (d.type !== "aircraft") return;
    const country = (d.data as any)?.originCountry;
    if (!country) return;
    counts.set(country, (counts.get(country) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([country]) => country);
}
