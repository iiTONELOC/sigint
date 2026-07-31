// ── Single-source regional clustering ──────────────────────────────
// Groups events by country + type within a rolling time window. The
// resulting Cluster[] is consumed by the product builder (index.ts).

import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import type { DataPoint } from "@/features/base/dataPoints";
import { CLUSTER_TIME_WINDOW, getCountry, getTs } from "./shared";

export type Cluster = {
  country: string;
  type: string;
  items: DataPoint[];
  centroidLat: number;
  centroidLon: number;
  maxSeverity: number;
};

export function clusterByRegion(items: DataPoint[]): Cluster[] {
  const byCountryType = new Map<string, DataPoint[]>();

  for (const item of items) {
    const country = getCountry(item);
    const key = `${country}:${item.type}`;
    let group = byCountryType.get(key);
    if (!group) {
      group = [];
      byCountryType.set(key, group);
    }
    group.push(item);
  }

  const clusters: Cluster[] = [];
  const now = Date.now();

  for (const [key, group] of byCountryType) {
    if (group.length < 2) continue;

    const [country, type] = key.split(":");
    const recent = group.filter((g) => now - getTs(g) < CLUSTER_TIME_WINDOW);
    if (recent.length < 2) continue;

    let sumLat = 0;
    let sumLon = 0;
    let maxSev = 0;
    for (const item of recent) {
      sumLat += recordLatitude(item);
      sumLon += recordLongitude(item);
      const d = item.data as Record<string, unknown>;
      const sev =
        (d.severity as number) ??
        (d.magnitude as number) ??
        (d.frp as number) ??
        0;
      if (sev > maxSev) maxSev = sev;
    }

    clusters.push({
      country: country!,
      type: type!,
      items: recent,
      centroidLat: sumLat / recent.length,
      centroidLon: sumLon / recent.length,
      maxSeverity: maxSev,
    });
  }

  return clusters;
}
