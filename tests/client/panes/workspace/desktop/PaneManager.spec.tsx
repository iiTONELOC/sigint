import {
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import {
  act,
  createElement,
  type ReactElement,
  type SetStateAction,
} from "react";
import { TooltipPlacement } from "@/components/Tooltip";
import { CacheKey } from "@shared/domain/cache";
import { DeviceType } from "@/layout-mode";
import {
  PaneNodeType,
  PaneType,
  SplitDirection,
} from "@/panes/workspace/model";
import { DomEvent } from "@/runtime";
import { SourceStatus } from "@shared/domain/sourceStatus";
import type {
  LayoutPreset,
  LayoutState,
  LeafNode,
  PaneType as PaneTypeValue,
} from "@/panes/paneTree";
import {
  flushReactUpdates,
  renderReact,
  waitForReact,
  type ReactRenderResult,
} from "../../../../support/react";
import {
  requirePaneDragHandle,
  requirePaneHeaderControls,
} from "../components/PaneHeader.fixture";

enum DesktopDragCoordinate {
  Origin = 0,
  Edge = 5,
  Center = 50,
  Size = 100,
}

enum DesktopFixtureCount {
  Single = 1,
  Pair = 2,
  ExpectedWatchPanes = 4,
  ActiveTracks = 120,
}

enum DesktopFixtureElement {
  PaneProbe = "div",
}

enum DesktopFixtureProperty {
  ClientX = "clientX",
  ClientY = "clientY",
  DataTransfer = "dataTransfer",
  Touches = "touches",
}

enum DesktopLeafId {
  DataTable = "desktop-data-table",
  Globe = "desktop-globe",
}

enum DesktopPaneAttribute {
  LeafId = "data-pane-leaf-id",
  Probe = "data-pane-probe",
}

enum DesktopPresetName {
  Fixture = "desktop-fixture-preset",
}

enum DesktopTestErrorMessage {
  ButtonMissing = "The expected desktop pane action did not render.",
  LeafMissing = "The expected desktop pane leaf did not render.",
  PortalMissing = "The expected desktop pane menu did not render.",
  ToolbarMissing = "The desktop pane toolbar did not render.",
}

type DesktopDragEventName =
  | DomEvent.DragOver
  | DomEvent.DragStart
  | DomEvent.Drop;

type DesktopTouchEventName =
  | DomEvent.TouchEnd
  | DomEvent.TouchMove
  | DomEvent.TouchStart;

type TooltipFixtureProps = Readonly<{
  children: ReactElement;
}>;

type TouchPoint = Readonly<{
  clientX: number;
  clientY: number;
}>;

type SignalListener<TArguments extends readonly unknown[]> = (
  ...arguments_: TArguments
) => void;

class SignalSlot<TArguments extends readonly unknown[]> {
  private listener: SignalListener<TArguments> | null = null;

  emit(...arguments_: TArguments): void {
    this.listener?.(...arguments_);
  }

  register(listener: SignalListener<TArguments>): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) {
        this.listener = null;
      }
    };
  }

  reset(): void {
    this.listener = null;
  }
}

const cacheValues = new Map<string, unknown>();
const dossierSignal = new SignalSlot<readonly []>();
const resetSignal = new SignalSlot<readonly []>();
const undoSignal = new SignalSlot<readonly [string]>();
const watchSignal = new SignalSlot<readonly []>();

function paneProbe(paneType: PaneTypeValue): () => ReactElement {
  return function PaneProbe() {
    return createElement(
      DesktopFixtureElement.PaneProbe,
      { [DesktopPaneAttribute.Probe]: paneType },
      paneType,
    );
  };
}

function noop(): void {}

mock.module("@/lib/cache/storageService", () => ({
  cacheGet: async (key: string) => cacheValues.get(key) ?? null,
  cacheSet: async (key: string, value: unknown) => {
    cacheValues.set(key, value);
  },
}));

mock.module("@/lib/runtime/layoutSignals", () => ({
  onDossierOpenRequest: (listener: () => void) =>
    dossierSignal.register(listener),
  onWalkthroughReset: (listener: () => void) =>
    resetSignal.register(listener),
  onWalkthroughUndo: (listener: (paneType: string) => void) =>
    undoSignal.register(listener),
  onWatchLayoutRequest: (listener: () => void) =>
    watchSignal.register(listener),
  setDossierOpen: noop,
  setWalkthroughLayoutSnapshot: noop,
  useWalkthroughStepId: () => null,
}));

mock.module("@/context/DataContext", () => ({
  useData: () => ({
    activeCount: DesktopFixtureCount.ActiveTracks,
    chromeHidden: false,
    colorMap: {},
    counts: {},
    dataSources: [{ status: SourceStatus.Live }],
    selectedCurrent: null,
    setChromeHidden: (_value: SetStateAction<boolean>) => undefined,
  }),
}));

mock.module("@/layout-mode", () => ({
  useIsMobileLayout: () => false,
  useLayoutMode: () => ({ deviceType: DeviceType.Desktop }),
}));

mock.module("@/components/Tooltip", () => ({
  Tooltip: ({ children }: TooltipFixtureProps) => children,
  TooltipPlacement,
}));

mock.module("@/panes/live-traffic/LiveTrafficPane", () => ({
  LiveTrafficPane: paneProbe(PaneType.Globe),
}));
mock.module("@/panes/data-table", () => ({
  DataTable: paneProbe(PaneType.DataTable),
}));
mock.module("@/panes/dossier", () => ({
  Dossier: paneProbe(PaneType.Dossier),
}));
mock.module("@/panes/intel-feed", () => ({
  IntelFeed: paneProbe(PaneType.IntelFeed),
}));
mock.module("@/panes/alert-log", () => ({
  AlertLog: paneProbe(PaneType.AlertLog),
}));
mock.module("@/panes/raw-console", () => ({
  RawConsole: paneProbe(PaneType.RawConsole),
}));
mock.module("@/panes/video-feed", () => ({
  VideoFeed: paneProbe(PaneType.VideoFeed),
}));
mock.module("@/panes/news-feed", () => ({
  NewsFeed: paneProbe(PaneType.NewsFeed),
}));
const { PaneManager } = await import("@/panes/PaneManager");
const { collectLeaves, split } = await import("@/panes/paneTree");

beforeEach(() => {
  cacheValues.clear();
  dossierSignal.reset();
  resetSignal.reset();
  undoSignal.reset();
  watchSignal.reset();
});

function leafNode(id: DesktopLeafId, paneType: PaneTypeValue): LeafNode {
  return { id, paneType, type: PaneNodeType.Leaf };
}

function singlePaneLayout(
  id: DesktopLeafId,
  paneType: PaneTypeValue,
): LayoutState {
  return { minimized: [], root: leafNode(id, paneType) };
}

function twoPaneLayout(
  firstId: DesktopLeafId,
  firstType: PaneTypeValue,
  secondId: DesktopLeafId,
  secondType: PaneTypeValue,
): LayoutState {
  return {
    minimized: [],
    root: split(
      SplitDirection.Horizontal,
      leafNode(firstId, firstType),
      leafNode(secondId, secondType),
    ),
  };
}

function setFixtureCache(
  layout: LayoutState,
  presets: readonly LayoutPreset[] = [],
): void {
  cacheValues.set(CacheKey.LayoutDesktop, layout);
  cacheValues.set(CacheKey.LayoutPresets, [...presets]);
}

async function renderManager(
  layout: LayoutState,
  presets: readonly LayoutPreset[] = [],
): Promise<ReactRenderResult> {
  setFixtureCache(layout, presets);
  const rendered = renderReact(<PaneManager />);
  await flushReactUpdates();
  const expectedTypes = collectLeaves(layout.root).map(
    (entry) => entry.paneType,
  );
  await waitForReact(() =>
    expectedTypes.every(
      (paneType) => paneProbeElement(paneType) !== null,
    ),
  );
  return rendered;
}

function paneProbeElement(paneType: PaneTypeValue): HTMLElement | null {
  const probe = document.body.querySelector(
    `[${DesktopPaneAttribute.Probe}="${paneType}"]`,
  );
  return probe instanceof HTMLElement ? probe : null;
}

function paneProbeCount(): number {
  return document.body.querySelectorAll(
    `[${DesktopPaneAttribute.Probe}]`,
  ).length;
}

function leafElement(id: DesktopLeafId): HTMLElement | null {
  const leaf = document.body.querySelector(
    `[${DesktopPaneAttribute.LeafId}="${id}"]`,
  );
  return leaf instanceof HTMLElement ? leaf : null;
}

function requireLeaf(id: DesktopLeafId): HTMLElement {
  const leaf = leafElement(id);
  if (leaf === null) {
    throw new TypeError(DesktopTestErrorMessage.LeafMissing);
  }
  return leaf;
}

function requireToolbar(container: HTMLDivElement): HTMLElement {
  const toolbar = container.firstElementChild?.firstElementChild;
  if (!(toolbar instanceof HTMLElement)) {
    throw new TypeError(DesktopTestErrorMessage.ToolbarMissing);
  }
  return toolbar;
}

function requireFirstButton(root: ParentNode): HTMLButtonElement {
  const button = root.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new TypeError(DesktopTestErrorMessage.ButtonMissing);
  }
  return button;
}

function requirePortal(container: HTMLDivElement): HTMLElement {
  const portal = Array.from(document.body.children).find(
    (element) => element !== container,
  );
  if (!(portal instanceof HTMLElement)) {
    throw new TypeError(DesktopTestErrorMessage.PortalMissing);
  }
  return portal;
}

function namedButton(name: DesktopPresetName): HTMLButtonElement | null {
  return (
    Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(name),
    ) ?? null
  );
}

function setDropRect(element: HTMLElement): void {
  element.getBoundingClientRect = () =>
    new DOMRect(
      DesktopDragCoordinate.Origin,
      DesktopDragCoordinate.Origin,
      DesktopDragCoordinate.Size,
      DesktopDragCoordinate.Size,
    );
}

function dragEvent(
  type: DesktopDragEventName,
  clientX: DesktopDragCoordinate = DesktopDragCoordinate.Origin,
  clientY: DesktopDragCoordinate = DesktopDragCoordinate.Origin,
): DragEvent {
  const event = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, DesktopFixtureProperty.DataTransfer, {
    configurable: true,
    value: new DataTransfer(),
  });
  Object.defineProperty(event, DesktopFixtureProperty.ClientX, {
    configurable: true,
    value: clientX,
  });
  Object.defineProperty(event, DesktopFixtureProperty.ClientY, {
    configurable: true,
    value: clientY,
  });
  return event;
}

async function mouseDrop(
  source: HTMLElement,
  target: HTMLElement,
  clientX: DesktopDragCoordinate,
  clientY: DesktopDragCoordinate,
): Promise<void> {
  act(() => {
    requirePaneDragHandle(source).dispatchEvent(
      dragEvent(DomEvent.DragStart),
    );
  });
  await flushReactUpdates();
  setDropRect(target);
  act(() => {
    target.dispatchEvent(dragEvent(DomEvent.DragOver, clientX, clientY));
  });
  await flushReactUpdates();
  act(() => {
    target.dispatchEvent(dragEvent(DomEvent.Drop, clientX, clientY));
  });
}

function touchEvent(
  type: DesktopTouchEventName,
  touches: readonly TouchPoint[],
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, DesktopFixtureProperty.Touches, {
    configurable: true,
    value: touches,
  });
  return event;
}

async function touchDrop(
  source: HTMLElement,
  target: HTMLElement,
): Promise<void> {
  const originalElementFromPoint = document.elementFromPoint;
  document.elementFromPoint = () => target;
  setDropRect(target);
  try {
    act(() => {
      requirePaneDragHandle(source).dispatchEvent(
        touchEvent(DomEvent.TouchStart, []),
      );
    });
    await flushReactUpdates();
    act(() => {
      window.dispatchEvent(
        touchEvent(DomEvent.TouchMove, [
          {
            clientX: DesktopDragCoordinate.Edge,
            clientY: DesktopDragCoordinate.Center,
          },
        ]),
      );
    });
    await flushReactUpdates();
    act(() => {
      window.dispatchEvent(touchEvent(DomEvent.TouchEnd, []));
    });
  } finally {
    document.elementFromPoint = originalElementFromPoint;
  }
}

describe("PaneManager desktop controls", () => {
  test("splits a pane through the split menu", async () => {
    const rendered = await renderManager(
      singlePaneLayout(DesktopLeafId.Globe, PaneType.Globe),
    );
    const { splitHorizontal } = requirePaneHeaderControls(
      requireLeaf(DesktopLeafId.Globe),
    );

    act(() => splitHorizontal.click());
    await waitForReact(
      () => document.body.children.length > DesktopFixtureCount.Single,
    );
    act(() => requireFirstButton(requirePortal(rendered.container)).click());
    await waitForReact(
      () => paneProbeCount() === DesktopFixtureCount.Pair,
    );

    expect(paneProbeElement(PaneType.Globe)).not.toBeNull();
  });

  test("changes a pane through the pane-type menu", async () => {
    const rendered = await renderManager(
      twoPaneLayout(
        DesktopLeafId.Globe,
        PaneType.Globe,
        DesktopLeafId.DataTable,
        PaneType.DataTable,
      ),
    );
    const { type } = requirePaneHeaderControls(
      requireLeaf(DesktopLeafId.DataTable),
    );

    act(() => type.click());
    await waitForReact(
      () => document.body.children.length > DesktopFixtureCount.Single,
    );
    act(() => requireFirstButton(requirePortal(rendered.container)).click());
    await waitForReact(
      () => paneProbeElement(PaneType.DataTable) === null,
    );

    expect(paneProbeCount()).toBe(DesktopFixtureCount.Pair);
  });

  test("minimizes and restores a pane through the toolbar", async () => {
    const rendered = await renderManager(
      twoPaneLayout(
        DesktopLeafId.Globe,
        PaneType.Globe,
        DesktopLeafId.DataTable,
        PaneType.DataTable,
      ),
    );
    const { minimize } = requirePaneHeaderControls(
      requireLeaf(DesktopLeafId.DataTable),
    );

    act(() => minimize.click());
    await waitForReact(
      () => paneProbeElement(PaneType.DataTable) === null,
    );
    act(() => requireFirstButton(requireToolbar(rendered.container)).click());
    await waitForReact(
      () => paneProbeElement(PaneType.DataTable) !== null,
    );

    expect(paneProbeElement(PaneType.DataTable)).not.toBeNull();
  });

  test("loads a named preset through the views menu", async () => {
    const selected: LayoutPreset = {
      name: DesktopPresetName.Fixture,
      state: singlePaneLayout(
        DesktopLeafId.DataTable,
        PaneType.DataTable,
      ),
    };
    const rendered = await renderManager(
      singlePaneLayout(DesktopLeafId.Globe, PaneType.Globe),
      [selected],
    );

    act(() => requireFirstButton(requireToolbar(rendered.container)).click());
    await waitForReact(
      () => namedButton(DesktopPresetName.Fixture) !== null,
    );
    const presetButton = namedButton(DesktopPresetName.Fixture);
    if (presetButton === null) {
      throw new TypeError(DesktopTestErrorMessage.ButtonMissing);
    }
    act(() => presetButton.click());
    await waitForReact(
      () => paneProbeElement(PaneType.DataTable) !== null,
    );

    expect(paneProbeElement(PaneType.Globe)).toBeNull();
  });
});

describe("PaneManager desktop drag wiring", () => {
  test("uses the center drop zone to swap pane identities", async () => {
    await renderManager(
      twoPaneLayout(
        DesktopLeafId.Globe,
        PaneType.Globe,
        DesktopLeafId.DataTable,
        PaneType.DataTable,
      ),
    );

    await mouseDrop(
      requireLeaf(DesktopLeafId.Globe),
      requireLeaf(DesktopLeafId.DataTable),
      DesktopDragCoordinate.Center,
      DesktopDragCoordinate.Center,
    );
    await waitForReact(
      () =>
        requireLeaf(DesktopLeafId.Globe).querySelector(
          `[${DesktopPaneAttribute.Probe}="${PaneType.DataTable}"]`,
        ) !== null,
    );

    expect(
      requireLeaf(DesktopLeafId.DataTable).querySelector(
        `[${DesktopPaneAttribute.Probe}="${PaneType.Globe}"]`,
      ),
    ).not.toBeNull();
  });

  test("uses an edge drop zone to insert beside the target", async () => {
    await renderManager(
      twoPaneLayout(
        DesktopLeafId.Globe,
        PaneType.Globe,
        DesktopLeafId.DataTable,
        PaneType.DataTable,
      ),
    );

    await mouseDrop(
      requireLeaf(DesktopLeafId.Globe),
      requireLeaf(DesktopLeafId.DataTable),
      DesktopDragCoordinate.Edge,
      DesktopDragCoordinate.Center,
    );
    await waitForReact(
      () => leafElement(DesktopLeafId.Globe) === null,
    );

    expect(paneProbeElement(PaneType.Globe)).not.toBeNull();
    expect(paneProbeElement(PaneType.DataTable)).not.toBeNull();
  });

  test("uses touch movement to select an edge drop zone", async () => {
    await renderManager(
      twoPaneLayout(
        DesktopLeafId.Globe,
        PaneType.Globe,
        DesktopLeafId.DataTable,
        PaneType.DataTable,
      ),
    );

    await touchDrop(
      requireLeaf(DesktopLeafId.Globe),
      requireLeaf(DesktopLeafId.DataTable),
    );
    await waitForReact(
      () => leafElement(DesktopLeafId.Globe) === null,
    );

    expect(paneProbeElement(PaneType.Globe)).not.toBeNull();
  });
});

describe("PaneManager desktop signals", () => {
  test("builds the watch layout once without duplicate panes", async () => {
    await renderManager(
      singlePaneLayout(DesktopLeafId.Globe, PaneType.Globe),
    );

    act(() => {
      watchSignal.emit();
      watchSignal.emit();
    });
    await waitForReact(
      () => paneProbeCount() === DesktopFixtureCount.ExpectedWatchPanes,
    );

    expect(paneProbeElement(PaneType.Globe)).not.toBeNull();
    expect(paneProbeElement(PaneType.Dossier)).not.toBeNull();
    expect(paneProbeElement(PaneType.AlertLog)).not.toBeNull();
    expect(paneProbeElement(PaneType.IntelFeed)).not.toBeNull();
  });
});
