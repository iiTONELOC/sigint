import { mock, type Mock } from "bun:test";
import { Circle } from "lucide-react";
import {
  createElement,
  type ComponentType,
  type ReactElement,
  type SetStateAction,
} from "react";
import {
  PaneLayoutRatio,
  PaneNodeType,
  PaneType,
  type PaneEdgeDropZoneValue,
  type PaneTypeValue,
  type SplitDirectionValue,
} from "@/panes/workspace/model";
import {
  collectLeaves,
  type LayoutNode,
  type LayoutPreset,
  type LayoutState,
  type LeafNode,
  type SplitNode,
} from "@/panes/paneTree";
import {
  renderReact,
  type ReactRenderResult,
} from "../../../../support/react";
import type { PaneCatalog } from "@/panes/workspace/paneCatalog";

export enum MobileFixtureAttribute {
  BlockId = "data-block-id",
  PaneProbe = "data-pane-probe",
}

export enum MobileFixtureCount {
  Empty = 0,
  Single = 1,
}

export enum MobileFixtureIndex {
  First = 0,
  Second = 1,
}

export enum MobileFixtureLabel {
  AlertLog = "Fixture alerts",
  DataTable = "Fixture data table",
  Dossier = "Fixture dossier",
  Globe = "Fixture globe",
  IntelFeed = "Fixture intel",
  NewsFeed = "Fixture news",
  RawConsole = "Fixture console",
  VideoFeed = "Fixture video",
}

export enum MobileFixtureMetric {
  ActiveTracks = 12,
}

export enum MobileFixtureNodeId {
  Added = "mobile-added",
  DataTable = "mobile-data-table",
  Dossier = "mobile-dossier",
  Globe = "mobile-globe",
  Minimized = "mobile-minimized",
  Replacement = "mobile-replacement",
  Root = "mobile-root",
  SecondaryRoot = "mobile-secondary-root",
}

export enum MobileFixtureObserverMargin {
  Default = "",
}

enum MobileFixtureElement {
  PaneProbe = "div",
}

enum MobileFixtureGlobalProperty {
  IntersectionObserver = "IntersectionObserver",
}

enum MobileFixtureObserverMetric {
  HiddenRatio = 0,
  VisibleRatio = 1,
  Time = 2,
  Size = 100,
}

enum MobileFixtureRelativeIndex {
  Last = -1,
  Penultimate = -2,
}

enum MobileFixtureSelector {
  Block = "[data-block-id]",
  Button = "button",
}

enum MobileFixtureTestErrorMessage {
  BlockContentMissing = "The mobile block content did not render.",
  BlockHeaderMissing = "The mobile block header did not render.",
  BlockMissing = "The expected mobile block did not render.",
  ButtonMissing = "The expected mobile pane action did not render.",
  HeightHandleMissing = "The mobile height handle did not render.",
  LeafHeaderMissing = "The mobile split-leaf header did not render.",
  ObserverMissing = "The mobile intersection observer did not observe the block.",
  PaneProbeMissing = "The expected mobile pane probe did not render.",
  PortalMissing = "The expected mobile pane menu did not render.",
  ToolbarMissing = "The mobile pane toolbar did not render.",
}

type MobileFixtureEntry = Readonly<{
  isIntersecting: boolean;
  target: Element;
  top: number;
}>;

type MobileFixtureOptions = Readonly<{
  availableTypes?: readonly PaneTypeValue[];
  chromeHidden?: boolean;
  counts?: Record<string, number>;
  layout: LayoutState;
  presets?: readonly LayoutPreset[];
  presetsLoaded?: boolean;
}>;

type MobileFixtureState = Readonly<{
  availableTypes: PaneTypeValue[];
  chromeHidden: boolean;
  counts: Record<string, number>;
  layout: LayoutState;
  presets: LayoutPreset[];
  presetsLoaded: boolean;
}>;

export type MobileFixtureCallbacks = Readonly<{
  changePaneType: Mock<
    (leafId: string, paneType: PaneTypeValue) => void
  >;
  closePane: Mock<(leafId: string) => void>;
  insertPaneBeside: Mock<
    (
      sourceLeafId: string,
      targetLeafId: string,
      zone: PaneEdgeDropZoneValue,
    ) => void
  >;
  minimizePane: Mock<
    (leafId: string, paneType: PaneTypeValue) => void
  >;
  onDeletePreset: Mock<(index: number) => void>;
  onLoadPreset: Mock<(preset: LayoutPreset) => void>;
  onSavePreset: Mock<(name: string) => void>;
  onUpdatePreset: Mock<(index: number) => void>;
  resizeSplit: Mock<(splitId: string, ratio: number) => void>;
  restorePane: Mock<(index: number) => void>;
  setActiveMobilePane: Mock<(index: number) => void>;
  splitPane: Mock<
    (
      leafId: string,
      direction: SplitDirectionValue,
      paneType: PaneTypeValue,
    ) => void
  >;
  swapPanes: Mock<
    (sourceLeafId: string, targetLeafId: string) => void
  >;
}>;

export type MobileFixtureRender = Readonly<{
  callbacks: MobileFixtureCallbacks;
  rendered: ReactRenderResult;
  rerender: (options: Partial<MobileFixtureOptions>) => void;
}>;

function paneProbe(paneType: PaneTypeValue): ComponentType {
  return function MobilePaneProbe() {
    return createElement(
      MobileFixtureElement.PaneProbe,
      { [MobileFixtureAttribute.PaneProbe]: paneType },
      paneType,
    );
  };
}

const PANE_CATALOG: PaneCatalog = {
  [PaneType.AlertLog]: {
    component: paneProbe(PaneType.AlertLog),
    icon: Circle,
    label: MobileFixtureLabel.AlertLog,
  },
  [PaneType.DataTable]: {
    component: paneProbe(PaneType.DataTable),
    icon: Circle,
    label: MobileFixtureLabel.DataTable,
  },
  [PaneType.Dossier]: {
    component: paneProbe(PaneType.Dossier),
    icon: Circle,
    label: MobileFixtureLabel.Dossier,
  },
  [PaneType.Globe]: {
    component: paneProbe(PaneType.Globe),
    icon: Circle,
    label: MobileFixtureLabel.Globe,
  },
  [PaneType.IntelFeed]: {
    component: paneProbe(PaneType.IntelFeed),
    icon: Circle,
    label: MobileFixtureLabel.IntelFeed,
  },
  [PaneType.NewsFeed]: {
    component: paneProbe(PaneType.NewsFeed),
    icon: Circle,
    label: MobileFixtureLabel.NewsFeed,
  },
  [PaneType.RawConsole]: {
    component: paneProbe(PaneType.RawConsole),
    icon: Circle,
    label: MobileFixtureLabel.RawConsole,
  },
  [PaneType.VideoFeed]: {
    component: paneProbe(PaneType.VideoFeed),
    icon: Circle,
    label: MobileFixtureLabel.VideoFeed,
  },
};

let fixtureChromeHidden = false;

mock.module("@/context/DataContext", () => ({
  useData: () => ({
    activeCount: MobileFixtureMetric.ActiveTracks,
    chromeHidden: fixtureChromeHidden,
    colorMap: {},
    counts: {},
    dataSources: [],
    selectedCurrent: null,
    setChromeHidden: (_value: SetStateAction<boolean>) => undefined,
  }),
}));

class MobileFixtureIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly scrollMargin: string;
  readonly thresholds: readonly number[];
  private readonly callback: IntersectionObserverCallback;
  private readonly observed = new Set<Element>();

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.root = options?.root ?? null;
    this.rootMargin =
      options?.rootMargin ?? MobileFixtureObserverMargin.Default;
    this.scrollMargin =
      options?.scrollMargin ?? MobileFixtureObserverMargin.Default;
    this.thresholds = [MobileFixtureObserverMetric.HiddenRatio];
    mobileFixtureObservers.add(this);
  }

  disconnect(): void {
    this.observed.clear();
  }

  emit(entry: MobileFixtureEntry): void {
    const rectangle = new DOMRect(
      MobileFixtureObserverMetric.HiddenRatio,
      entry.top,
      MobileFixtureObserverMetric.Size,
      MobileFixtureObserverMetric.Size,
    );
    const intersection = entry.isIntersecting
      ? rectangle
      : new DOMRect();
    this.callback(
      [
        {
          boundingClientRect: rectangle,
          intersectionRatio: entry.isIntersecting
            ? MobileFixtureObserverMetric.VisibleRatio
            : MobileFixtureObserverMetric.HiddenRatio,
          intersectionRect: intersection,
          isIntersecting: entry.isIntersecting,
          rootBounds: null,
          target: entry.target,
          time: MobileFixtureObserverMetric.Time,
        },
      ],
      this,
    );
  }

  observes(target: Element): boolean {
    return this.observed.has(target);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }
}

const mobileFixtureObservers = new Set<MobileFixtureIntersectionObserver>();

function installIntersectionObserver(): void {
  Object.defineProperty(
    globalThis,
    MobileFixtureGlobalProperty.IntersectionObserver,
    {
      configurable: true,
      value: MobileFixtureIntersectionObserver,
      writable: true,
    },
  );
}

installIntersectionObserver();

const { PaneMobile } = await import("@/panes/PaneMobile");

function fixtureCallbacks(): MobileFixtureCallbacks {
  return {
    changePaneType: mock(
      (_leafId: string, _paneType: PaneTypeValue) => undefined,
    ),
    closePane: mock((_leafId: string) => undefined),
    insertPaneBeside: mock(
      (
        _sourceLeafId: string,
        _targetLeafId: string,
        _zone: PaneEdgeDropZoneValue,
      ) => undefined,
    ),
    minimizePane: mock(
      (_leafId: string, _paneType: PaneTypeValue) => undefined,
    ),
    onDeletePreset: mock((_index: number) => undefined),
    onLoadPreset: mock((_preset: LayoutPreset) => undefined),
    onSavePreset: mock((_name: string) => undefined),
    onUpdatePreset: mock((_index: number) => undefined),
    resizeSplit: mock((_splitId: string, _ratio: number) => undefined),
    restorePane: mock((_index: number) => undefined),
    setActiveMobilePane: mock((_index: number) => undefined),
    splitPane: mock(
      (
        _leafId: string,
        _direction: SplitDirectionValue,
        _paneType: PaneTypeValue,
      ) => undefined,
    ),
    swapPanes: mock(
      (_sourceLeafId: string, _targetLeafId: string) => undefined,
    ),
  };
}

function fixtureState(options: MobileFixtureOptions): MobileFixtureState {
  return {
    availableTypes: [...(options.availableTypes ?? [])],
    chromeHidden: options.chromeHidden ?? false,
    counts: options.counts ?? {},
    layout: options.layout,
    presets: [...(options.presets ?? [])],
    presetsLoaded: options.presetsLoaded ?? true,
  };
}

function mobileElement(
  state: MobileFixtureState,
  callbacks: MobileFixtureCallbacks,
): ReactElement {
  fixtureChromeHidden = state.chromeHidden;
  return (
    <PaneMobile
      activeCount={MobileFixtureMetric.ActiveTracks}
      activeMobilePane={MobileFixtureIndex.First}
      allLeaves={collectLeaves(state.layout.root)}
      availableTypes={state.availableTypes}
      changePaneType={callbacks.changePaneType}
      closePane={callbacks.closePane}
      counts={state.counts}
      dataSources={[]}
      insertPaneBeside={callbacks.insertPaneBeside}
      layout={state.layout}
      leafCount={collectLeaves(state.layout.root).length}
      minimizePane={callbacks.minimizePane}
      onDeletePreset={callbacks.onDeletePreset}
      onLoadPreset={callbacks.onLoadPreset}
      onSavePreset={callbacks.onSavePreset}
      onUpdatePreset={callbacks.onUpdatePreset}
      paneCatalog={PANE_CATALOG}
      presets={state.presets}
      presetsLoaded={state.presetsLoaded}
      resizeSplit={callbacks.resizeSplit}
      restorePane={callbacks.restorePane}
      setActiveMobilePane={callbacks.setActiveMobilePane}
      splitPane={callbacks.splitPane}
      swapPanes={callbacks.swapPanes}
    />
  );
}

export function resetMobileFixture(): void {
  fixtureChromeHidden = false;
  mobileFixtureObservers.clear();
  installIntersectionObserver();
}

export function mobileLeaf(
  id: MobileFixtureNodeId,
  paneType: PaneTypeValue,
): LeafNode {
  return { id, paneType, type: PaneNodeType.Leaf };
}

export function mobileSplit(
  id: MobileFixtureNodeId,
  direction: SplitDirectionValue,
  first: LayoutNode,
  second: LayoutNode,
): SplitNode {
  return {
    children: [first, second],
    direction,
    id,
    ratio: PaneLayoutRatio.Equal,
    type: PaneNodeType.Split,
  };
}

export function mobileLayout(
  root: LayoutNode,
  minimized: LayoutState["minimized"] = [],
): LayoutState {
  return { minimized, root };
}

export function renderMobileFixture(
  options: MobileFixtureOptions,
): MobileFixtureRender {
  const callbacks = fixtureCallbacks();
  let state = fixtureState(options);
  const rendered = renderReact(mobileElement(state, callbacks));
  return {
    callbacks,
    rendered,
    rerender: (nextOptions) => {
      state = {
        ...state,
        ...nextOptions,
        availableTypes: nextOptions.availableTypes
          ? [...nextOptions.availableTypes]
          : state.availableTypes,
        presets: nextOptions.presets
          ? [...nextOptions.presets]
          : state.presets,
      };
      rendered.rerender(mobileElement(state, callbacks));
    },
  };
}

export function mobileBlockIds(): string[] {
  return Array.from(
    document.body.querySelectorAll(MobileFixtureSelector.Block),
  ).flatMap((element) => {
    const id = element.getAttribute(MobileFixtureAttribute.BlockId);
    return id === null ? [] : [id];
  });
}

export function requireMobileBlock(
  id: MobileFixtureNodeId,
): HTMLElement {
  const block = document.body.querySelector(
    `[${MobileFixtureAttribute.BlockId}="${id}"]`,
  );
  if (!(block instanceof HTMLElement)) {
    throw new TypeError(MobileFixtureTestErrorMessage.BlockMissing);
  }
  return block;
}

export function paneProbeElement(
  paneType: PaneTypeValue,
): HTMLElement | null {
  const probe = document.body.querySelector(
    `[${MobileFixtureAttribute.PaneProbe}="${paneType}"]`,
  );
  return probe instanceof HTMLElement ? probe : null;
}

export function requirePaneProbe(paneType: PaneTypeValue): HTMLElement {
  const probe = paneProbeElement(paneType);
  if (probe === null) {
    throw new TypeError(MobileFixtureTestErrorMessage.PaneProbeMissing);
  }
  return probe;
}

export function buttonWithText(
  text: string,
  root: ParentNode = document.body,
): HTMLButtonElement | null {
  return (
    Array.from(root.querySelectorAll(MobileFixtureSelector.Button)).find(
      (button) => button.textContent?.includes(text),
    ) ?? null
  );
}

export function buttonsWithText(
  text: string,
  root: ParentNode = document.body,
): HTMLButtonElement[] {
  return Array.from(
    root.querySelectorAll(MobileFixtureSelector.Button),
  ).filter((button) => button.textContent?.includes(text));
}

export function requireButtonWithText(
  text: string,
  root: ParentNode = document.body,
): HTMLButtonElement {
  const button = buttonWithText(text, root);
  if (button === null) {
    throw new TypeError(MobileFixtureTestErrorMessage.ButtonMissing);
  }
  return button;
}

export function requireBlockHeader(block: HTMLElement): HTMLElement {
  const header = block.firstElementChild;
  if (!(header instanceof HTMLElement)) {
    throw new TypeError(MobileFixtureTestErrorMessage.BlockHeaderMissing);
  }
  return header;
}

export function blockHeaderButtons(
  block: HTMLElement,
): HTMLButtonElement[] {
  return Array.from(
    requireBlockHeader(block).querySelectorAll(MobileFixtureSelector.Button),
  );
}

export function requireBlockMoveButton(
  block: HTMLElement,
): HTMLButtonElement {
  const [button] = blockHeaderButtons(block);
  return requireButton(button);
}

export function requireBlockTypeButton(
  block: HTMLElement,
  label: MobileFixtureLabel,
): HTMLButtonElement {
  return requireButtonWithText(label, requireBlockHeader(block));
}

export function requireBlockToggleButton(
  block: HTMLElement,
): HTMLButtonElement {
  const button = blockHeaderButtons(block).at(
    MobileFixtureRelativeIndex.Penultimate,
  );
  return requireButton(button);
}

export function requireSideSplitButton(
  block: HTMLElement,
): HTMLButtonElement {
  const [, , button] = blockHeaderButtons(block);
  return requireButton(button);
}

export function requireVerticalSplitButton(
  block: HTMLElement,
): HTMLButtonElement {
  const [, , button] = blockHeaderButtons(block);
  return requireButton(button);
}

export function requireLeafHeader(
  block: HTMLElement,
  label: MobileFixtureLabel,
): HTMLElement {
  const header = requireButtonWithText(label, block).parentElement;
  if (!(header instanceof HTMLElement)) {
    throw new TypeError(MobileFixtureTestErrorMessage.LeafHeaderMissing);
  }
  return header;
}

export function requireLeafMinimizeButton(
  header: HTMLElement,
): HTMLButtonElement {
  const [, , , button] = Array.from(
    header.querySelectorAll(MobileFixtureSelector.Button),
  );
  return requireButton(button);
}

export function requireLeafPopOutButton(
  header: HTMLElement,
): HTMLButtonElement {
  const [, , button] = Array.from(
    header.querySelectorAll(MobileFixtureSelector.Button),
  );
  return requireButton(button);
}

export function requireBlockContent(block: HTMLElement): HTMLElement {
  const content = Array.from(block.children).find(
    (element) =>
      element instanceof HTMLElement && element.style.height !== "",
  );
  if (!(content instanceof HTMLElement)) {
    throw new TypeError(MobileFixtureTestErrorMessage.BlockContentMissing);
  }
  return content;
}

export function requireMoveZoneButtons(
  block: HTMLElement,
): HTMLButtonElement[] {
  return Array.from(
    requireBlockContent(block).querySelectorAll(
      MobileFixtureSelector.Button,
    ),
  );
}

export function requireHeightHandle(block: HTMLElement): HTMLElement {
  const handle = block.lastElementChild;
  if (!(handle instanceof HTMLElement)) {
    throw new TypeError(MobileFixtureTestErrorMessage.HeightHandleMissing);
  }
  return handle;
}

export function requireToolbar(block: HTMLElement): HTMLElement {
  const toolbar = block.parentElement?.previousElementSibling;
  if (!(toolbar instanceof HTMLElement)) {
    throw new TypeError(MobileFixtureTestErrorMessage.ToolbarMissing);
  }
  return toolbar;
}

export function requireAddButton(toolbar: HTMLElement): HTMLButtonElement {
  const button = Array.from(
    toolbar.querySelectorAll(MobileFixtureSelector.Button),
  ).find(
    (candidate) =>
      (candidate.textContent?.trim().length ?? MobileFixtureCount.Empty) ===
      MobileFixtureCount.Empty,
  );
  return requireButton(button);
}

export function requireRestoreButton(
  toolbar: HTMLElement,
): HTMLButtonElement {
  const [, button] = Array.from(
    toolbar.querySelectorAll(MobileFixtureSelector.Button),
  );
  return requireButton(button);
}

export function requireViewsButton(
  toolbar: HTMLElement,
): HTMLButtonElement {
  const button = Array.from(
    toolbar.querySelectorAll(MobileFixtureSelector.Button),
  ).at(MobileFixtureRelativeIndex.Last);
  return requireButton(button);
}

export function requirePortal(
  container: HTMLDivElement,
): HTMLElement {
  const portal = Array.from(document.body.children).find(
    (element) => element !== container,
  );
  if (!(portal instanceof HTMLElement)) {
    throw new TypeError(MobileFixtureTestErrorMessage.PortalMissing);
  }
  return portal;
}

export function emitMobileIntersection(
  target: Element,
  isIntersecting: boolean,
  top: number,
): void {
  let emitted = false;
  for (const observer of mobileFixtureObservers) {
    if (!observer.observes(target)) {
      continue;
    }
    observer.emit({ isIntersecting, target, top });
    emitted = true;
  }
  if (!emitted) {
    throw new TypeError(MobileFixtureTestErrorMessage.ObserverMissing);
  }
}

export function blockContentHeight(block: HTMLElement): number {
  return Number.parseFloat(requireBlockContent(block).style.height);
}

export function fixturePreset(
  name: string,
  layout: LayoutState,
): LayoutPreset {
  return { name, state: layout };
}

function requireButton(
  button: HTMLButtonElement | undefined,
): HTMLButtonElement {
  if (button === undefined) {
    throw new TypeError(MobileFixtureTestErrorMessage.ButtonMissing);
  }
  return button;
}
