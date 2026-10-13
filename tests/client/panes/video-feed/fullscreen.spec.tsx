import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { VideoFeedPane } from "@/panes/video-feed/VideoFeedPane";
import { VideoSlot } from "@/panes/video-feed/VideoSlot";
import type { Channel } from "@shared/domain/videoChannel";
import { installFetchMock, type RestoreFetch } from "../../../support/network";
import { flushReactUpdates, renderReact } from "../../../support/react";

enum VideoFullscreenProperty {
  Enabled = "fullscreenEnabled",
  NativeEnter = "webkitEnterFullscreen",
  Request = "requestFullscreen",
}

enum VideoFullscreenTitle {
  Pane = "Fullscreen pane",
  Slot = "Fullscreen",
}

enum VideoFullscreenSelector {
  Slot = ".video-slot",
}

enum VideoFullscreenFixture {
  None = 0,
  Single = 1,
  SlotIndex = 0,
  UnavailableStatus = 503,
}

enum VideoFullscreenErrorMessage {
  ButtonMissing = "The slot fullscreen button did not render.",
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

const nativeEnter = mock(() => undefined);
const fullscreenTargets: Element[] = [];
let restoreFetch: RestoreFetch = () => undefined;

function requestFullscreenProbe(this: Element): Promise<void> {
  fullscreenTargets.push(this);
  return Promise.resolve();
}

function setElementFullscreen(enabled: boolean): void {
  Object.defineProperty(document, VideoFullscreenProperty.Enabled, {
    configurable: true,
    value: enabled,
  });
}

function noop(): void {}

function renderSlotButton(): HTMLButtonElement {
  renderReact(
    <VideoSlot
      slot={{ channel: CHANNEL, error: false, loading: false }}
      slotIndex={VideoFullscreenFixture.SlotIndex}
      channels={{}}
      onAssign={noop}
      onClear={noop}
      onSlotError={noop}
      onSlotLoaded={noop}
      muted
      onToggleMute={noop}
      gridSize={1}
    />,
  );
  const button = document.querySelector(`[title="${VideoFullscreenTitle.Slot}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new TypeError(VideoFullscreenErrorMessage.ButtonMissing);
  }
  return button;
}

beforeEach(() => {
  nativeEnter.mockClear();
  fullscreenTargets.length = 0;
  Object.defineProperty(HTMLVideoElement.prototype, VideoFullscreenProperty.NativeEnter, {
    configurable: true,
    value: nativeEnter,
  });
  Object.defineProperty(HTMLElement.prototype, VideoFullscreenProperty.Request, {
    configurable: true,
    value: requestFullscreenProbe,
  });
  restoreFetch = installFetchMock(async () =>
    new Response(null, { status: VideoFullscreenFixture.UnavailableStatus }),
  );
});

afterEach(() => {
  restoreFetch();
  Reflect.deleteProperty(HTMLVideoElement.prototype, VideoFullscreenProperty.NativeEnter);
  Reflect.deleteProperty(HTMLElement.prototype, VideoFullscreenProperty.Request);
  Reflect.deleteProperty(document, VideoFullscreenProperty.Enabled);
});

describe("Video feed fullscreen", () => {
  test("hides pane fullscreen where the browser has no element fullscreen", async () => {
    setElementFullscreen(false);
    renderReact(<VideoFeedPane />);
    await flushReactUpdates();

    expect(
      document.querySelectorAll(`[title="${VideoFullscreenTitle.Pane}"]`).length,
    ).toBe(VideoFullscreenFixture.None);
  });

  test("fills the screen with the slot where the browser has element fullscreen", () => {
    setElementFullscreen(true);
    const button = renderSlotButton();

    act(() => button.click());

    expect(nativeEnter).not.toHaveBeenCalled();
    expect(fullscreenTargets).toHaveLength(VideoFullscreenFixture.Single);
    expect(fullscreenTargets[0] === button.closest(VideoFullscreenSelector.Slot)).toBe(true);
  });

  test("opens the native player where the browser has no element fullscreen", () => {
    setElementFullscreen(false);
    const button = renderSlotButton();

    act(() => button.click());

    expect(nativeEnter).toHaveBeenCalledTimes(VideoFullscreenFixture.Single);
    expect(fullscreenTargets).toHaveLength(VideoFullscreenFixture.None);
  });
});
