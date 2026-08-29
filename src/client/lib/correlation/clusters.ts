import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import type { DataPoint, DataType } from "@/features/base/dataPoints";
import { CLUSTER_TIME_WINDOW, getCountry, getTs } from "./shared";

export type Cluster = {
  country: string;
  type: DataType;
  items: DataPoint[];
  centroidLat: number;
  centroidLon: number;
  maxSeverity: number;
};

type ClusterGroup = Readonly<{
  country: string;
  type: DataType;
  items: DataPoint[];
}>;

export function clusterByRegion(items: DataPoint[]): Cluster[] {
  const byCountryType = new Map<string, ClusterGroup>();

  for (const item of items) {
    const country = getCountry(item);
    const key = `${country}:${item.type}`;
    let group = byCountryType.get(key);
    if (!group) {
      group = { country, type: item.type, items: [] };
      byCountryType.set(key, group);
    }
    group.items.push(item);
  }

  const clusters: Cluster[] = [];
  const now = Date.now();

  for (const group of byCountryType.values()) {
    if (group.items.length < 2) continue;
    const recent = group.items.filter(
      (item) => now - getTs(item) < CLUSTER_TIME_WINDOW,
    );
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
      country: group.country,
      type: group.type,
      items: recent,
      centroidLat: sumLat / recent.length,
      centroidLon: sumLon / recent.length,
      maxSeverity: maxSev,
    });
  }

  return clusters;
}
