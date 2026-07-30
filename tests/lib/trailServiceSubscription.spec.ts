import { describe, expect, test } from "bun:test";
import { createTrailMirror, type TrailReader } from "@/lib/geo/trailService";
import type { TrailEntry } from "@/lib/geo/trails/trailStore";
import { Domain } from "@shared/domain/identity";

// The regression: the presentation command read the trail mirror
// synchronously while the reply was still in flight, so a selected aircraft
// reached the renderer with an empty trail and nothing ever re-sent it.

enum TrailTestId {
  Aircraft = "A1",
  Other = "A2",
}

function entry(pointCount: number): TrailEntry {
  return {
    type: Domain.Aircraft,
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

    mirror.watch(TrailTestId.Aircraft);
    expect(mirror.trail(TrailTestId.Aircraft)).toHaveLength(0);
    const beforeReply = notifications;

    reader.replies[0]?.(entry(3));
    await Promise.resolve();
    await Promise.resolve();

    expect(notifications).toBeGreaterThan(beforeReply);
    expect(mirror.trail(TrailTestId.Aircraft)).toHaveLength(3);
  });

  test("a reply for a superseded selection is discarded", async () => {
    const reader = deferredReader();
    const mirror = createTrailMirror(() => reader);

    mirror.watch(TrailTestId.Aircraft);
    mirror.watch(TrailTestId.Other);
    expect(reader.replies).toHaveLength(2);

    reader.replies[0]?.(entry(5));
    await Promise.resolve();
    await Promise.resolve();

    expect(mirror.trail(TrailTestId.Aircraft)).toHaveLength(0);
    expect(mirror.trail(TrailTestId.Other)).toHaveLength(0);
  });

  test("the revision advances when the watched track changes", () => {
    const mirror = createTrailMirror(() => null);
    const before = mirror.revision();
    mirror.watch(TrailTestId.Aircraft);
    expect(mirror.revision()).toBeGreaterThan(before);
  });

  test("no reader means no crash and an empty mirror", () => {
    const mirror = createTrailMirror(() => null);
    mirror.watch(TrailTestId.Aircraft);
    expect(mirror.trail(TrailTestId.Aircraft)).toHaveLength(0);
    expect(mirror.motion(TrailTestId.Aircraft)).toBeNull();
  });
});
