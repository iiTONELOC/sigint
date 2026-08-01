import {
  mock,
  type Mock,
} from "bun:test";
import { type SetStateAction } from "react";
import { Domain } from "@shared/domain/identity";
import { ThemeProvider } from "@/context/ThemeContext";
import type { DataPoint } from "@/features/base/dataPoints";
import { CacheKey } from "@shared/domain/cache";
import { cacheSet } from "@/lib/cache/storageService";
import { setUnitsMode, UnitMode } from "@/preferences/units";
import {
  renderReact,
  type ReactRenderResult,
} from "../../../../support/react";

export enum TickerFixtureColor {
  Accent = "#00d4f0",
}

export enum TickerFixtureCount {
  Empty = 0,
  Single = 1,
}

export enum TickerFixtureTestErrorMessage {
  AnimationFrameMissing = "The expected ticker animation frame was not scheduled.",
  ButtonMissing = "The expected ticker item button did not render.",
  IntervalMissing = "The expected ticker interval was not scheduled.",
  ResizeObserverMissing = "The ticker resize observer did not render.",
  RootMissing = "The ticker root did not render.",
}

enum TickerFixtureCounter {
  Start = 1,
}

enum TickerFixtureGeometry {
  Origin = 0,
  Height = 1,
}

enum TickerFixtureGlobalName {
  CancelAnimationFrame = "cancelAnimationFrame",
  ClearInterval = "clearInterval",
  RequestAnimationFrame = "requestAnimationFrame",
  ResizeObserver = "ResizeObserver",
  SetInterval = "setInterval",
}

enum TickerFixturePosition {
  First = 0,
}

enum TickerFixtureSelector {
  Button = "button",
}

type AsyncIntervalAction = () => void | Promise<void>;

type IntervalRecord = Readonly<{
  action: AsyncIntervalAction;
}>;

type ResizeEntry = Readonly<{
  target: Element;
  width: number;
}>;

export type TickerComponentFixture = Readonly<{
  rendered: ReactRenderResult;
  rerender: (items: DataPoint[], compact?: boolean) => void;
  selectAndZoom: Mock<(item: DataPoint) => void>;
}>;

class AnimationFrameDriver {
  private readonly callbacks = new Map<number, FrameRequestCallback>();
  private nextId = TickerFixtureCounter.Start;

  cancel(id: number): void {
    this.callbacks.delete(id);
  }

  get pendingCount(): number {
    return this.callbacks.size;
  }

  request(callback: FrameRequestCallback): number {
    const id = this.nextId;
    this.nextId += TickerFixtureCounter.Start;
    this.callbacks.set(id, callback);
    return id;
  }

  reset(): void {
    this.callbacks.clear();
    this.nextId = TickerFixtureCounter.Start;
  }

  step(timestamp: number): void {
    const callbacks = [...this.callbacks.values()];
    if (callbacks.length === TickerFixtureCount.Empty) {
      throw new TypeError(
        TickerFixtureTestErrorMessage.AnimationFrameMissing,
      );
    }
    this.callbacks.clear();
    for (const callback of callbacks) {
      callback(timestamp);
    }
  }
}

class IntervalDriver {
  private readonly intervals = new Map<number, IntervalRecord>();
  private nextId = TickerFixtureCounter.Start;

  add(handler: AsyncIntervalAction): number {
    const id = this.nextId;
    this.nextId += TickerFixtureCounter.Start;
    this.intervals.set(id, {
      action: handler,
    });
    return id;
  }

  clear(id: number | undefined): void {
    if (id !== undefined) {
      this.intervals.delete(id);
    }
  }

  get count(): number {
    return this.intervals.size;
  }

  reset(): void {
    this.intervals.clear();
    this.nextId = TickerFixtureCounter.Start;
  }

  async runLatest(): Promise<void> {
    const latest = [...this.intervals.values()].at(-1);
    if (!latest) {
      throw new TypeError(
        TickerFixtureTestErrorMessage.IntervalMissing,
      );
    }
    await latest.action();
  }
}

class TickerFixtureResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly observed = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObserverDriver.add(this);
  }

  disconnect(): void {
    this.observed.clear();
  }

  emit({ target, width }: ResizeEntry): void {
    const rectangle = new DOMRect(
      TickerFixtureGeometry.Origin,
      TickerFixtureGeometry.Origin,
      width,
      TickerFixtureGeometry.Height,
    );
    this.callback(
      [
        {
          borderBoxSize: [],
          contentBoxSize: [],
          contentRect: rectangle,
          devicePixelContentBoxSize: [],
          target,
        },
      ],
      this,
    );
  }

  get observedCount(): number {
    return this.observed.size;
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  targets(): readonly Element[] {
    return [...this.observed];
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }
}

class ResizeObserverDriver {
  private readonly observers = new Set<TickerFixtureResizeObserver>();

  add(observer: TickerFixtureResizeObserver): void {
    this.observers.add(observer);
  }

  emit(width: number): void {
    let emitted = false;
    for (const observer of this.observers) {
      for (const target of observer.targets()) {
        observer.emit({ target, width });
        emitted = true;
      }
    }
    if (!emitted) {
      throw new TypeError(
        TickerFixtureTestErrorMessage.ResizeObserverMissing,
      );
    }
  }

  get observedCount(): number {
    let count = TickerFixtureCount.Empty;
    for (const observer of this.observers) {
      count += observer.observedCount;
    }
    return count;
  }

  reset(): void {
    this.observers.clear();
  }
}

export const animationFrameDriver = new AnimationFrameDriver();
export const intervalDriver = new IntervalDriver();
export const resizeObserverDriver = new ResizeObserverDriver();

const originalTickerGlobals = new Map<
  TickerFixtureGlobalName,
  unknown
>(
  Object.values(TickerFixtureGlobalName).map((name) => [
    name,
    Reflect.get(globalThis, name),
  ]),
);

let selectAndZoom: Mock<(item: DataPoint) => void> = mock(
  (_item: DataPoint) => undefined,
);

mock.module("@/context/DataContext", () => ({
  useData: () => ({
    activeCount: TickerFixtureCount.Empty,
    chromeHidden: false,
    colorMap: {
      [Domain.Aircraft]: TickerFixtureColor.Accent,
    },
    counts: {},
    dataSources: [],
    selectAndZoom,
    selectedCurrent: null,
    setChromeHidden: (_value: SetStateAction<boolean>) => undefined,
  }),
}));

const { Ticker } = await import("@/components/Ticker");
const { TickerSpeedPolicy } = await import("@/shell/ticker");

function installTickerEnvironment(): void {
  Object.defineProperty(
    globalThis,
    TickerFixtureGlobalName.CancelAnimationFrame,
    {
      configurable: true,
      value: (id: number) => animationFrameDriver.cancel(id),
      writable: true,
    },
  );
  Object.defineProperty(
    globalThis,
    TickerFixtureGlobalName.ClearInterval,
    {
      configurable: true,
      value: (id: number | undefined) => intervalDriver.clear(id),
      writable: true,
    },
  );
  Object.defineProperty(
    globalThis,
    TickerFixtureGlobalName.RequestAnimationFrame,
    {
      configurable: true,
      value: (callback: FrameRequestCallback) =>
        animationFrameDriver.request(callback),
      writable: true,
    },
  );
  Object.defineProperty(
    globalThis,
    TickerFixtureGlobalName.ResizeObserver,
    {
      configurable: true,
      value: TickerFixtureResizeObserver,
      writable: true,
    },
  );
  Object.defineProperty(
    globalThis,
    TickerFixtureGlobalName.SetInterval,
    {
      configurable: true,
      value: (handler: AsyncIntervalAction) =>
        intervalDriver.add(handler),
      writable: true,
    },
  );
}

function tickerElement(
  items: DataPoint[],
  compact: boolean,
) {
  return (
    <ThemeProvider>
      <Ticker compact={compact} items={items} />
    </ThemeProvider>
  );
}

export async function resetTickerComponentFixture(): Promise<void> {
  animationFrameDriver.reset();
  intervalDriver.reset();
  resizeObserverDriver.reset();
  selectAndZoom = mock((_item: DataPoint) => undefined);
  installTickerEnvironment();
  await Promise.all([
    cacheSet(CacheKey.TickerSpeed, TickerSpeedPolicy.Default),
    setUnitsMode(UnitMode.Both),
  ]);
}

export function restoreTickerComponentFixture(): void {
  for (const [name, value] of originalTickerGlobals) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
  }
}

export async function setTickerStoppedSpeed(): Promise<void> {
  await cacheSet(CacheKey.TickerSpeed, TickerSpeedPolicy.Stopped);
}

export function renderTickerFixture(
  items: DataPoint[],
  compact = false,
): TickerComponentFixture {
  let currentCompact = compact;
  const rendered = renderReact(
    tickerElement(items, currentCompact),
  );
  return {
    rendered,
    rerender: (nextItems, nextCompact = currentCompact) => {
      currentCompact = nextCompact;
      rendered.rerender(
        tickerElement(nextItems, currentCompact),
      );
    },
    selectAndZoom,
  };
}

export function tickerButtons(
  root: ParentNode = document.body,
): HTMLButtonElement[] {
  return Array.from(
    root.querySelectorAll(TickerFixtureSelector.Button),
  );
}

export function requireTickerRoot(
  root: ParentNode = document.body,
): HTMLElement {
  const tickerRoot = root.firstElementChild;
  if (!(tickerRoot instanceof HTMLElement)) {
    throw new TypeError(
      TickerFixtureTestErrorMessage.RootMissing,
    );
  }
  return tickerRoot;
}

export function requireTickerButton(
  root: ParentNode = document.body,
): HTMLButtonElement {
  const button = tickerButtons(root).at(TickerFixturePosition.First);
  if (!button) {
    throw new TypeError(
      TickerFixtureTestErrorMessage.ButtonMissing,
    );
  }
  return button;
}

export function tickerTextOccurrences(
  root: ParentNode,
  text: string,
): number {
  return (root.textContent ?? "").split(text).length -
    TickerFixtureCounter.Start;
}
