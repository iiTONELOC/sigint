import { describe, expect, test } from "bun:test";
import { createTrailMirror, type TrailReader } from "@/lib/geo/trailService";
import type { TrailEntry } from "@/lib/geo/trails/trailStore";

// The regression: the presentation command read the trail mirror
// synchronously while the reply was still in flight, so a selected aircraft
// reached the renderer with an empty trail and nothing ever re-sent it.

const AIRCRAFT_ID = "A1";
const OTHER_ID = "A2";

function entry(pointCount: number): TrailEntry {
  return {
    type: "aircraft",
    points: Array.from({ length: pointCount }, (unusedValue, index) => ({
      lat: 40 + index,
      lon: -74,
      ts: index,
    })),
    lastSeen: pointCount,
    heading: 90,
    speedMps: 250,
  };
}

type DeferredReader = TrailReader &
  Readonly<{ replies: ((value: TrailEntry | null) => void)[] }>;

function deferredReader(): DeferredReader {
  const replies: ((value: TrailEntry | null) => void)[] = [];
  return {
    replies,
    getTrail: () =>
      new Promise<TrailEntry | null>((resolve) => {
        replies.push(resolve);
      }),
  };
}

describe("watched trail subscription", () => {
  test("a trail arriving after the selection notifies subscribers", async () => {
    const reader = deferredReader();
    const mirror = createTrailMirror(() => reader);
    let notifications = 0;
    mirror.subscribe(() => {
      notifications += 1;
    });

    mirror.watch(AIRCRAFT_ID);
    expect(mirror.trail(AIRCRAFT_ID)).toHaveLength(0);
    const beforeReply = notifications;

    reader.replies[0]?.(entry(3));
    await Promise.resolve();
    await Promise.resolve();

    expect(notifications).toBeGreaterThan(beforeReply);
    expect(mirror.trail(AIRCRAFT_ID)).toHaveLength(3);
  });

  test("a reply for a superseded selection is discarded", async () => {
    const reader = deferredReader();
    const mirror = createTrailMirror(() => reader);

    mirror.watch(AIRCRAFT_ID);
    mirror.watch(OTHER_ID);
    expect(reader.replies).toHaveLength(2);

    reader.replies[0]?.(entry(5));
    await Promise.resolve();
    await Promise.resolve();

    expect(mirror.trail(AIRCRAFT_ID)).toHaveLength(0);
    expect(mirror.trail(OTHER_ID)).toHaveLength(0);
  });

  test("the revision advances when the watched track changes", () => {
    const mirror = createTrailMirror(() => null);
    const before = mirror.revision();
    mirror.watch(AIRCRAFT_ID);
    expect(mirror.revision()).toBeGreaterThan(before);
  });

  test("no reader means no crash and an empty mirror", () => {
    const mirror = createTrailMirror(() => null);
    mirror.watch(AIRCRAFT_ID);
    expect(mirror.trail(AIRCRAFT_ID)).toHaveLength(0);
    expect(mirror.motion(AIRCRAFT_ID)).toBeNull();
  });
});
