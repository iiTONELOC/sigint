import { Domain } from "@shared/domain/identity";

export const POINT_LAYER_ORDER: readonly Domain[] = [
  Domain.CyclonesForecast,
  Domain.Cyclones,
];

type LayeredPoint = Readonly<{
  item: Readonly<{ type: string }>;
}>;

const layerIndex = new Map<string, number>(
  POINT_LAYER_ORDER.map((type, index) => [type, index]),
);

export function orderPointsByLayer<T extends LayeredPoint>(points: T[]): T[] {
  if (points.length < 2) return points;
  const buckets: T[][] = Array.from(
    { length: POINT_LAYER_ORDER.length },
    () => [],
  );
  for (const point of points) {
    const index = layerIndex.get(point.item.type) ?? 0;
    buckets[index]?.push(point);
  }
  const ordered: T[] = [];
  for (const bucket of buckets) {
    for (const point of bucket) ordered.push(point);
  }
  return ordered;
}
