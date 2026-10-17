import { Domain } from "@shared/domain/identity";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import {
  AircraftWatchPolicy,
  reportedHeadingDegrees,
} from "@shared/domain/aircraft";
import { isRecord, shortestTurnDegrees } from "../../shared/geo";

const MISSED_BROWSER_POLLS = 2;

const WATCH_EXPIRY_MS =
  getPointSourceDefinition(Domain.Aircraft).pollIntervalMs * MISSED_BROWSER_POLLS;

type WatchedAircraft = {
  renewedAt: number;
  polledSlot: number | null;
  headingDegrees: number | null;
  dynamic: boolean;
  waiters: (() => void)[];
};

const watched = new Map<string, WatchedAircraft>();
let lastWatchSlot: number | null = null;

export function watchAircraft(hex: string, now = Date.now()): void {
  const entry = watched.get(hex);
  if (entry) {
    entry.renewedAt = now;
    return;
  }
  watched.set(hex, {
    renewedAt: now,
    polledSlot: null,
    headingDegrees: null,
    dynamic: true,
    waiters: [],
  });
}

export function firstWatchResult(hex: string, timeoutMs: number): Promise<void> {
  const entry = watched.get(hex);
  if (!entry || entry.polledSlot !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    entry.waiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function pruneExpired(now: number): void {
  for (const [hex, entry] of watched) {
    if (now - entry.renewedAt > WATCH_EXPIRY_MS) watched.delete(hex);
  }
}

function slotsUntilDue(entry: WatchedAircraft, slot: number): number {
  if (entry.polledSlot === null) return 0;
  const interval = entry.dynamic
    ? AircraftWatchPolicy.DynamicSlots
    : AircraftWatchPolicy.SteadySlots;
  return entry.polledSlot + interval - slot;
}

function mostOverdue(slot: number): [string, WatchedAircraft] | null {
  let due: [string, WatchedAircraft] | null = null;
  for (const candidate of watched) {
    const remaining = slotsUntilDue(candidate[1], slot);
    if (remaining <= 0 && (due === null || remaining < slotsUntilDue(due[1], slot))) {
      due = candidate;
    }
  }
  return due;
}

function newlyWatched(): [string, WatchedAircraft] | null {
  for (const candidate of watched) {
    if (candidate[1].polledSlot === null) return candidate;
  }
  return null;
}

export function nextDueWatch(slot: number, now = Date.now()): string | null {
  pruneExpired(now);
  const throttled =
    lastWatchSlot !== null && slot - lastWatchSlot < AircraftWatchPolicy.DynamicSlots;
  const due = newlyWatched() ?? (throttled ? null : mostOverdue(slot));
  if (due === null) return null;
  due[1].polledSlot = slot;
  lastWatchSlot = slot;
  return due[0];
}

function isDynamic(
  record: Readonly<Record<string, unknown>>,
  headingDegrees: number | null,
  previousHeadingDegrees: number | null,
): boolean {
  const roll = typeof record.roll === "number" ? record.roll : 0;
  const climb = typeof record.baro_rate === "number" ? record.baro_rate : 0;
  const turned = headingDegrees !== null &&
    previousHeadingDegrees !== null &&
    Math.round(shortestTurnDegrees(headingDegrees - previousHeadingDegrees)) !== 0;
  return Math.round(roll) !== 0 ||
    Math.abs(climb) > AircraftWatchPolicy.LevelFeetPerMinute ||
    turned;
}

function releaseWaiters(entry: WatchedAircraft): void {
  const waiters = entry.waiters;
  entry.waiters = [];
  for (const release of waiters) release();
}

export function recordWatchResult(hex: string, records: readonly unknown[]): void {
  const entry = watched.get(hex);
  if (!entry) return;
  const record = records.find(isRecord);
  if (record) {
    const headingDegrees = reportedHeadingDegrees(record.track, record.true_heading);
    entry.dynamic = isDynamic(record, headingDegrees, entry.headingDegrees);
    entry.headingDegrees = headingDegrees;
  }
  releaseWaiters(entry);
}
