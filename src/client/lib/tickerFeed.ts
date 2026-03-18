import type { DataPoint } from "@/features/base/dataPoints";
import { featureRegistry } from "@/features/registry";

function isEmergencyAircraft(item: DataPoint): boolean {
  if (item.type !== "aircraft") return false;
  const sq = (item.data as any)?.squawk ?? "";
  return sq === "7700" || sq === "7600" || sq === "7500";
}

function isMoving(item: DataPoint): boolean {
  if (item.type === "aircraft") {
    // Emergency aircraft always show regardless
    if (isEmergencyAircraft(item)) return true;
    return (item.data as any)?.onGround !== true;
  }
  if (item.type === "ships") {
    const sog = (item.data as any)?.sog ?? 0;
    return sog >= 0.5;
  }
  // Events and quakes always show
  return true;
}

function getTimestamp(item: DataPoint): number {
  if (item.timestamp) {
    const t = new Date(item.timestamp).getTime();
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

/** Sort newest first */
function byRecency(a: DataPoint, b: DataPoint): number {
  return getTimestamp(b) - getTimestamp(a);
}

const TICKER_SIZE = 80;
const TYPE_ORDER = [
  "aircraft",
  "ships",
  "events",
  "quakes",
  "fires",
  "weather",
];

/**
 * Build ticker items — newest first, interleaved across all active types.
 * Emergency aircraft always lead. Then round-robin newest from each type.
 * Grounded aircraft and moored ships (sog < 0.5) are excluded.
 */
export function buildTickerItems(
  allData: DataPoint[],
  _filters: Record<string, unknown>,
  _layers: Record<string, boolean>,
): DataPoint[] {
  // Bucket by type, sorted by recency within each bucket
  const byType = new Map<string, DataPoint[]>();
  for (const type of TYPE_ORDER) byType.set(type, []);

  for (const item of allData) {
    if (!featureRegistry.has(item.type)) continue;
    if (!isMoving(item)) continue;
    byType.get(item.type)?.push(item);
  }

  for (const [type, items] of byType) {
    byType.set(type, items.sort(byRecency));
  }

  const result: DataPoint[] = [];
  const usedIds = new Set<string>();

  // Emergency aircraft always first
  const aircraft = byType.get("aircraft") ?? [];
  for (const item of aircraft) {
    if (isEmergencyAircraft(item) && result.length < TICKER_SIZE) {
      result.push(item);
      usedIds.add(item.id);
    }
  }

  // Build index per type (skip already-used emergencies)
  const indices = new Map<string, number>();
  for (const type of TYPE_ORDER) {
    if (type === "aircraft") {
      // Find first non-emergency
      const list = byType.get(type) ?? [];
      let startIdx = 0;
      while (startIdx < list.length && usedIds.has(list[startIdx]!.id)) {
        startIdx++;
      }
      indices.set(type, startIdx);
    } else {
      indices.set(type, 0);
    }
  }

  // Round-robin: take one from each type that has data, repeat
  while (result.length < TICKER_SIZE) {
    let added = false;
    for (const type of TYPE_ORDER) {
      if (result.length >= TICKER_SIZE) break;
      const queue = byType.get(type);
      if (!queue) continue;
      let idx = indices.get(type) ?? 0;

      // Skip used items
      while (idx < queue.length && usedIds.has(queue[idx]!.id)) idx++;
      if (idx >= queue.length) continue;

      result.push(queue[idx]!);
      usedIds.add(queue[idx]!.id);
      indices.set(type, idx + 1);
      added = true;
    }
    // All queues exhausted
    if (!added) break;
  }

  // Shuffle non-emergency items so the feed feels varied each refresh
  // Keep emergencies at the front
  const emergencyCount = result.findIndex((item) => !isEmergencyAircraft(item));
  const start = emergencyCount < 0 ? result.length : emergencyCount;
  const rest = result.slice(start);
  // Fisher-Yates shuffle
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [...result.slice(0, start), ...rest];
}
