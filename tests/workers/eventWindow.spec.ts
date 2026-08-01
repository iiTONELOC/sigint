import { type PointType } from "@shared/domain/pointType";
import { Domain } from "@shared/domain/identity";
// ── Event rolling window ────────────────────────────────────────────
// GDELT publishes only the newest export every fifteen minutes, so the
// seven-day view is rebuilt on each poll: retained entries still inside the
// window, plus the incoming batch. This replaced BaseProvider's mergeFn.

import { describe, expect, test } from "bun:test";
import {
  eventWindowDurationMs,
  mergeEventWindow,
} from "@/workers/data/sources/events";
import type { EventPoint } from "@/features/intel/events/data/codec";
import { IntelSeverity } from "@shared/domain/correlation";
import { TestInstant } from "../_support";

function event(id: string, agedMs: number): EventPoint {
  return {
    id,
    type: Domain.Events,
    lat: 1,
    lon: 2,
    timestamp: new Date(
      TestInstant.EventSceneNow - agedMs,
    ).toISOString(),
    data: { headline: id, severity: IntelSeverity.Monitoring },
  };
}

const ids = (points: readonly EventPoint[]): string[] =>
  points.map((point) => point.id).sort((a, b) => a.localeCompare(b));

describe("mergeEventWindow", () => {
  test("keeps retained entries inside the window", () => {
    const retained = [
      event("A", 0),
      event("B", eventWindowDurationMs() / 2),
    ];
    expect(
      ids(
        mergeEventWindow(
          retained,
          [],
          TestInstant.EventSceneNow,
        ),
      ),
    ).toEqual(["A", "B"]);
  });

  test("drops retained entries past the window", () => {
    const retained = [
      event("A", 0),
      event("OLD", eventWindowDurationMs() + 1),
    ];
    expect(
      ids(
        mergeEventWindow(
          retained,
          [],
          TestInstant.EventSceneNow,
        ),
      ),
    ).toEqual(["A"]);
  });

  test("keeps an entry exactly on the boundary", () => {
    const retained = [event("EDGE", eventWindowDurationMs())];
    expect(
      ids(
        mergeEventWindow(
          retained,
          [],
          TestInstant.EventSceneNow,
        ),
      ),
    ).toEqual(["EDGE"]);
  });

  test("adds incoming entries", () => {
    const merged = mergeEventWindow(
      [event("A", 0)],
      [event("B", 0)],
      TestInstant.EventSceneNow,
    );
    expect(ids(merged)).toEqual(["A", "B"]);
  });

  test("incoming wins on a repeated id", () => {
    const retained = [event("A", 0)];
    const incoming: EventPoint[] = [
      {
        ...event("A", 0),
        data: {
          headline: "updated",
          severity: IntelSeverity.Conflict,
        },
      },
    ];
    const merged = mergeEventWindow(
      retained,
      incoming,
      TestInstant.EventSceneNow,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.data.headline).toBe("updated");
  });

  test("admits incoming entries regardless of age", () => {
    // The window bounds retention, not intake; the feed decides what is new.
    const incoming = [event("OLD", eventWindowDurationMs() * 2)];
    expect(
      ids(
        mergeEventWindow(
          [],
          incoming,
          TestInstant.EventSceneNow,
        ),
      ),
    ).toEqual(["OLD"]);
  });

  test("treats a missing timestamp as outside the window", () => {
    const undated: EventPoint = {
      id: "NO_TS",
      type: Domain.Events,
      lat: 0,
      lon: 0,
      data: {},
    };
    expect(
      mergeEventWindow(
        [undated],
        [],
        TestInstant.EventSceneNow,
      ),
    ).toHaveLength(0);
  });
});
