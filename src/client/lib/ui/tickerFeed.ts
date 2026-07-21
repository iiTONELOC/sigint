import type { DataPoint } from "@/features/base/dataPoints";
import { featureRegistry } from "@/features/registry";

export const TICKER_ITEM_LIMIT = 80;

const MINIMUM_MOVING_SHIP_SPEED_KNOTS = 0.5;
const TYPE_ORDER = [
  "aircraft",
  "ships",
  "events",
  "quakes",
  "fires",
  "weather",
  "cyclones",
] as const;

function isEmergencyAircraft(item: DataPoint): boolean {
  if (item.type !== "aircraft") return false;
  const squawk = item.data.squawk ?? "";
  return squawk === "7700" || squawk === "7600" || squawk === "7500";
}

function isMoving(item: DataPoint): boolean {
  if (item.type === "aircraft") {
    return isEmergencyAircraft(item) || item.data.onGround !== true;
  }
  if (item.type === "ships") {
    return (item.data.sog ?? 0) >= MINIMUM_MOVING_SHIP_SPEED_KNOTS;
  }
  return true;
}

function getTimestamp(item: DataPoint): number {
  if (!item.timestamp) return 0;
  const timestamp = Date.parse(item.timestamp);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildTickerItems(allData: readonly DataPoint[]): DataPoint[] {
  const byType = new Map<string, DataPoint[]>();
  for (const type of TYPE_ORDER) byType.set(type, []);

  for (const item of allData) {
    if (!featureRegistry.has(item.type) || !isMoving(item)) continue;
    byType.get(item.type)?.push(item);
  }

  const timestampByItem = new Map<DataPoint, number>();
  for (const items of byType.values()) {
    for (const item of items) timestampByItem.set(item, getTimestamp(item));
  }
  for (const items of byType.values()) {
    items.sort(
      (left, right) =>
        (timestampByItem.get(right) ?? 0) -
        (timestampByItem.get(left) ?? 0),
    );
  }

  const result: DataPoint[] = [];
  const usedIds = new Set<string>();
  const aircraft = byType.get("aircraft") ?? [];
  for (const item of aircraft) {
    if (isEmergencyAircraft(item) && result.length < TICKER_ITEM_LIMIT) {
      result.push(item);
      usedIds.add(item.id);
    }
  }

  const indices = new Map<string, number>();
  for (const type of TYPE_ORDER) {
    const queue = byType.get(type) ?? [];
    let index = 0;
    while (index < queue.length) {
      const item = queue[index];
      if (!item || !usedIds.has(item.id)) break;
      index++;
    }
    indices.set(type, index);
  }

  while (result.length < TICKER_ITEM_LIMIT) {
    let added = false;
    for (const type of TYPE_ORDER) {
      if (result.length >= TICKER_ITEM_LIMIT) break;
      const queue = byType.get(type);
      if (!queue) continue;
      let index = indices.get(type) ?? 0;
      let item = queue[index];
      while (item && usedIds.has(item.id)) {
        index++;
        item = queue[index];
      }
      if (!item) continue;
      result.push(item);
      usedIds.add(item.id);
      indices.set(type, index + 1);
      added = true;
    }
    if (!added) break;
  }

  const firstNonEmergency = result.findIndex(
    (item) => !isEmergencyAircraft(item),
  );
  const shuffleStart =
    firstNonEmergency < 0 ? result.length : firstNonEmergency;
  const shuffled = result.slice(shuffleStart);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];
    if (!current || !swap) continue;
    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }
  return [...result.slice(0, shuffleStart), ...shuffled];
}
