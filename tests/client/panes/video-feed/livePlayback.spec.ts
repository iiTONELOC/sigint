import { describe, expect, test } from "bun:test";
import { livePlayback } from "@/panes/video-feed/HlsPlayer";

enum LiveFixtureSeconds {
  Edge = 500,
  Near = 498,
  Far = 440,
  Ahead = 505,
  Zero = 0,
  NearDelay = 2,
  FarDelay = 60,
}

describe("livePlayback", () => {
  test("is live near the edge and not live once behind the tolerance", () => {
    expect(livePlayback(LiveFixtureSeconds.Edge, LiveFixtureSeconds.Near, false)).toEqual({ delay: LiveFixtureSeconds.NearDelay, live: true });
    expect(livePlayback(LiveFixtureSeconds.Edge, LiveFixtureSeconds.Far, false)).toEqual({ delay: LiveFixtureSeconds.FarDelay, live: false });
  });

  test("is not live while paused, and never reports a negative delay", () => {
    expect(livePlayback(LiveFixtureSeconds.Edge, LiveFixtureSeconds.Edge, true).live).toBe(false);
    expect(livePlayback(LiveFixtureSeconds.Edge, LiveFixtureSeconds.Ahead, false)).toEqual({ delay: LiveFixtureSeconds.Zero, live: true });
  });

  test("treats a stream without a known edge as live", () => {
    expect(livePlayback(null, LiveFixtureSeconds.Far, false)).toEqual({ delay: LiveFixtureSeconds.Zero, live: true });
  });
});
