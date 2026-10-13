import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, useEffect, type RefObject } from "react";
import type { Channel } from "@shared/domain/videoChannel";
import type { PlayerHandle } from "@/panes/video-feed/videoFeedTypes";
import { flushReactUpdates, renderReact, setReactInputValue } from "../../../support/react";

enum DvrFixtureSeconds {
  Behind = 30,
  Edge = 0,
  Target = 12,
  Zero = 0,
}

enum DvrFixtureCount {
  None = 0,
  One = 1,
}

enum DvrFixtureText {
  GoLive = "GO LIVE",
  Live = "LIVE",
  Paused = "PAUSED",
  ThirtyBehind = "-30s",
}

enum DvrFixtureSelector {
  Seek = "input[aria-label='Seek video']",
}

enum DvrFixtureTitle {
  Pause = "Pause",
}

enum DvrFixtureErrorMessage {
  SeekMissing = "The seek bar did not render.",
}

const CHANNEL: Channel = {
  country: "US",
  featured: false,
  id: "fixture-news",
  languages: [],
  logo: null,
  name: "Fixture News",
  url: "https://stream.invalid/live.m3u8",
};

const playback = { delay: DvrFixtureSeconds.Zero, paused: false, time: 100, range: [40, 100] as [number, number] };
const goLive = mock(() => { playback.delay = DvrFixtureSeconds.Zero; playback.paused = false; });
const seekTo = mock((_time: number) => undefined);
let tick: () => void = () => undefined;

const fakeHandle: PlayerHandle = {
  get isLive() { return !playback.paused && playback.delay === DvrFixtureSeconds.Zero; },
  get currentDelay() { return playback.delay; },
  get bufferRange() { return playback.range; },
  get currentTime() { return playback.time; },
  play() { playback.paused = false; },
  pause() { playback.paused = true; },
  goLive,
  seekTo,
  getVideoElement() { return null; },
};

let mocking = true;
const real = { ...(await import("@/panes/video-feed/HlsPlayer")) };
type PlayerProps = Parameters<typeof real.HlsPlayer>[0];

function FakePlayer({ onTick, playerRef }: Readonly<{ onTick: () => void; playerRef: RefObject<PlayerHandle | null> }>) {
  useEffect(() => {
    playerRef.current = fakeHandle;
    tick = onTick;
    return () => { playerRef.current = null; };
  }, [onTick, playerRef]);
  return <output data-fake-player="" />;
}

function SwitchPlayer(props: PlayerProps) {
  const Impl = mocking ? FakePlayer : real.HlsPlayer;
  return <Impl {...props} />;
}

mock.module("@/panes/video-feed/HlsPlayer", () => ({ ...real, HlsPlayer: SwitchPlayer }));

const { VideoSlot } = await import("@/panes/video-feed/VideoSlot");

function noop(): void {}

function renderSlot(): HTMLElement {
  return renderReact(
    <VideoSlot
      slot={{ channel: CHANNEL, error: false, loading: false }}
      slotIndex={DvrFixtureCount.None}
      channels={{}}
      onAssign={noop}
      onClear={noop}
      onSlotError={noop}
      onSlotLoaded={noop}
      muted
      onToggleMute={noop}
      gridSize={1}
    />,
  ).container;
}

function seekBar(): HTMLInputElement {
  const input = document.querySelector(DvrFixtureSelector.Seek);
  if (!(input instanceof HTMLInputElement)) throw new TypeError(DvrFixtureErrorMessage.SeekMissing);
  return input;
}

afterAll(() => {
  mocking = false;
});

beforeEach(() => {
  playback.delay = DvrFixtureSeconds.Zero;
  playback.paused = false;
  goLive.mockClear();
  seekTo.mockClear();
});

describe("VideoSlot DVR", () => {
  test("follows playback: the delay and GO LIVE appear when the player falls behind", async () => {
    const container = renderSlot();
    await flushReactUpdates();
    expect(container.textContent).toContain(DvrFixtureText.Live);
    expect(document.querySelector(DvrFixtureSelector.Seek)).toBeNull();

    playback.delay = DvrFixtureSeconds.Behind;
    act(() => tick());
    await flushReactUpdates();

    expect(container.textContent).toContain(DvrFixtureText.ThirtyBehind);
    expect(container.textContent).toContain(DvrFixtureText.GoLive);
    expect(document.querySelector(DvrFixtureSelector.Seek)).not.toBeNull();
  });

  test("GO LIVE returns the player to the edge and hides the bar", async () => {
    const container = renderSlot();
    playback.delay = DvrFixtureSeconds.Behind;
    act(() => tick());
    await flushReactUpdates();

    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === DvrFixtureText.GoLive);
    act(() => button?.click());
    act(() => tick());
    await flushReactUpdates();

    expect(goLive).toHaveBeenCalledTimes(DvrFixtureCount.One);
    expect(document.querySelector(DvrFixtureSelector.Seek)).toBeNull();
    expect(container.textContent).toContain(DvrFixtureText.Live);
  });

  test("pause shows PAUSED with the bar; the player's own pause counts too", async () => {
    const container = renderSlot();
    const pause = container.querySelector(`[title="${DvrFixtureTitle.Pause}"]`);
    act(() => { if (pause instanceof HTMLButtonElement) pause.click(); });
    await flushReactUpdates();

    expect(container.textContent).toContain(DvrFixtureText.Paused);
    expect(document.querySelector(DvrFixtureSelector.Seek)).not.toBeNull();
  });

  test("seeks on release, not while dragging", async () => {
    renderSlot();
    playback.delay = DvrFixtureSeconds.Behind;
    act(() => tick());
    await flushReactUpdates();
    const input = seekBar();

    setReactInputValue(input, String(DvrFixtureSeconds.Target + 40));
    await flushReactUpdates();
    expect(seekTo).toHaveBeenCalledTimes(DvrFixtureCount.None);

    act(() => { input.dispatchEvent(new Event("pointerup", { bubbles: true })); });
    await flushReactUpdates();

    expect(seekTo).toHaveBeenCalledTimes(DvrFixtureCount.One);
    expect(seekTo).toHaveBeenCalledWith(DvrFixtureSeconds.Target + 40);
  });
});
