import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { act } from "react";
import { DomEvent } from "@/runtime";
import {
  cleanupReactRoots,
  flushReactUpdates,
  waitForReact,
} from "../../../../support/react";
import {
  TickerFixtureCount,
  TickerFixturePointId,
  animationFrameDriver,
  intervalDriver,
  renderTickerFixture,
  requireTickerButton,
  requireTickerRoot,
  resetTickerComponentFixture,
  resizeObserverDriver,
  restoreTickerComponentFixture,
  setTickerStoppedSpeed,
  tickerAircraft,
  tickerButtons,
  tickerTextOccurrences,
} from "../fixtures";

enum TickerComponentMetric {
  FrameAdvance = 100_000,
  FrameAfterResume = 300_000,
  FrameResume = 200_000,
  FrameStart = 1_000,
  NarrowWidth = 100,
  StoppedIntervalCount = 2,
  WideWidth = 1_200,
}

beforeEach(async () => {
  await resetTickerComponentFixture();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: TickerComponentMetric.WideWidth,
  });
});

afterEach(() => {
  cleanupReactRoots();
  restoreTickerComponentFixture();
});

function threeInitialItems() {
  return [
    tickerAircraft(TickerFixturePointId.Alpha),
    tickerAircraft(TickerFixturePointId.Bravo),
    tickerAircraft(TickerFixturePointId.Charlie),
  ];
}

describe("Ticker output", () => {
  test("keeps the empty state free of item actions", () => {
    const fixture = renderTickerFixture([]);

    expect(
      tickerButtons(fixture.rendered.container),
    ).toHaveLength(TickerFixtureCount.Empty);
    expect(
      requireTickerRoot(fixture.rendered.container),
    ).toBeInstanceOf(HTMLElement);
  });

  test("shows item identity and selects the item", () => {
    const item = tickerAircraft(TickerFixturePointId.Alpha);
    const fixture = renderTickerFixture([item]);
    const button = requireTickerButton(fixture.rendered.container);

    expect(button.title).toContain(TickerFixturePointId.Alpha);
    expect(button.textContent).toContain(TickerFixturePointId.Alpha);

    act(() => {
      button.click();
    });

    expect(fixture.selectAndZoom).toHaveBeenCalledWith(item);
  });

  test("omits full-card content in compact mode", () => {
    const item = tickerAircraft(TickerFixturePointId.Alpha);
    const fixture = renderTickerFixture([item], true);
    const compactButton = requireTickerButton(fixture.rendered.container);

    expect(
      tickerTextOccurrences(
        compactButton,
        TickerFixturePointId.Alpha,
      ),
    ).toBe(TickerFixtureCount.Single);

    fixture.rerender([item], false);

    expect(
      tickerTextOccurrences(
        requireTickerButton(fixture.rendered.container),
        TickerFixturePointId.Alpha,
      ),
    ).toBeGreaterThan(TickerFixtureCount.Single);
  });
});

describe("Ticker movement", () => {
  test("recycles continuously and preserves offset across refresh", async () => {
    const fixture = renderTickerFixture(threeInitialItems());

    act(() => {
      animationFrameDriver.step(TickerComponentMetric.FrameStart);
      animationFrameDriver.step(TickerComponentMetric.FrameAdvance);
    });
    await flushReactUpdates();

    expect(
      requireTickerButton(fixture.rendered.container).title,
    ).toContain(TickerFixturePointId.Bravo);

    fixture.rerender([
      tickerAircraft(TickerFixturePointId.Delta),
      tickerAircraft(TickerFixturePointId.Echo),
      tickerAircraft(TickerFixturePointId.Foxtrot),
    ]);

    expect(
      requireTickerButton(fixture.rendered.container).title,
    ).toContain(TickerFixturePointId.Echo);
  });

  test("pauses on hover and resumes after exit", async () => {
    const fixture = renderTickerFixture(threeInitialItems());
    const root = requireTickerRoot(fixture.rendered.container);

    act(() => {
      animationFrameDriver.step(TickerComponentMetric.FrameStart);
      root.dispatchEvent(
        new MouseEvent(DomEvent.MouseOver, {
          bubbles: true,
        }),
      );
      animationFrameDriver.step(TickerComponentMetric.FrameAdvance);
    });
    await flushReactUpdates();

    expect(
      requireTickerButton(fixture.rendered.container).title,
    ).toContain(TickerFixturePointId.Alpha);

    act(() => {
      root.dispatchEvent(
        new MouseEvent(DomEvent.MouseOut, {
          bubbles: true,
        }),
      );
      animationFrameDriver.step(TickerComponentMetric.FrameResume);
      animationFrameDriver.step(
        TickerComponentMetric.FrameAfterResume,
      );
    });
    await flushReactUpdates();

    expect(
      requireTickerButton(fixture.rendered.container).title,
    ).toContain(TickerFixturePointId.Bravo);
  });

  test("rotates the visible set when persisted speed is stopped", async () => {
    await setTickerStoppedSpeed();
    const fixture = renderTickerFixture([
      ...threeInitialItems(),
      tickerAircraft(TickerFixturePointId.Delta),
      tickerAircraft(TickerFixturePointId.Echo),
    ]);
    const firstTitle =
      requireTickerButton(fixture.rendered.container).title;

    await waitForReact(
      () =>
        intervalDriver.count >=
        TickerComponentMetric.StoppedIntervalCount,
    );
    await act(async () => {
      await intervalDriver.runLatest();
    });

    expect(
      requireTickerButton(fixture.rendered.container).title,
    ).not.toBe(firstTitle);
  });
});

describe("Ticker lifecycle", () => {
  test("updates its visible buffer after container resize", async () => {
    const fixture = renderTickerFixture(threeInitialItems());
    const before = tickerButtons(fixture.rendered.container).length;

    act(() => {
      resizeObserverDriver.emit(TickerComponentMetric.NarrowWidth);
    });
    await flushReactUpdates();

    expect(
      tickerButtons(fixture.rendered.container).length,
    ).toBeLessThan(before);
  });

  test("releases frames, intervals, and resize observation", () => {
    const fixture = renderTickerFixture(threeInitialItems());

    expect(animationFrameDriver.pendingCount).toBeGreaterThan(
      TickerFixtureCount.Empty,
    );
    expect(intervalDriver.count).toBeGreaterThan(
      TickerFixtureCount.Empty,
    );
    expect(resizeObserverDriver.observedCount).toBeGreaterThan(
      TickerFixtureCount.Empty,
    );

    fixture.rendered.unmount();

    expect(animationFrameDriver.pendingCount).toBe(
      TickerFixtureCount.Empty,
    );
    expect(intervalDriver.count).toBe(TickerFixtureCount.Empty);
    expect(resizeObserverDriver.observedCount).toBe(
      TickerFixtureCount.Empty,
    );
  });
});
