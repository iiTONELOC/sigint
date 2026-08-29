import { expect, mock, type Mock } from "bun:test";
import { act, type ReactElement } from "react";
import { ResizeHandle } from "@/panes/ResizeHandle";
import { SplitDirection, type SplitDirectionValue } from "@/panes/workspace/model/pane";
import { DomEvent, DomInputType } from "@/runtime";
import {
  renderReact,
  type ReactRenderResult,
} from "../../../../support/react";

enum ResizeFixtureChildIndex {
  LeadingPane = 0,
  TrailingPane = 2,
}

enum ResizeFixtureDimension {
  PaneHeight = 400,
  PaneWidth = 500,
  ParentHeight = 800,
  ParentLeft = 100,
  ParentTop = 250,
  ParentWidth = 1_000,
}

enum ResizeFixtureSelector {
  Control = "input",
}

export enum ResizeExpectedRatio {
  Center = 0.5,
  Decreased = 0.48,
  HorizontalMaximum = 0.66,
  HorizontalMinimum = 0.34,
  Increased = 0.52,
  VerticalMaximum = 0.75,
  VerticalMinimum = 0.25,
}

export enum ResizeFixtureSplitId {
  Primary = "resize-fixture-split",
}

export enum ResizePointerCoordinate {
  HorizontalCenter = 600,
  HorizontalEnd = 1_100,
  HorizontalStart = 100,
  VerticalCenter = 650,
  VerticalEnd = 1_050,
  VerticalStart = 250,
}

export enum ResizePointerId {
  Primary = 7,
}

enum ResizeTestErrorMessage {
  CallbackMissing = "The resize callback did not run.",
  ControlMissing = "The resize control did not render.",
  PaneMissing = "The resize fixture pane did not render.",
  ParentMissing = "The resize fixture parent did not render.",
}

export type ResizeCallback = (splitId: string, ratio: number) => void;

export type ResizeHandleFixture = Readonly<{
  control: HTMLInputElement;
  onResize: Mock<ResizeCallback>;
  releasePointerCapture: Mock<(pointerId: number) => void>;
  rendered: ReactRenderResult;
  rerender: (onResize: ResizeCallback) => void;
  setPointerCapture: Mock<(pointerId: number) => void>;
}>;

function fixtureElement(
  direction: SplitDirectionValue,
  onResize: ResizeCallback,
): ReactElement {
  return (
    <div>
      <div />
      <ResizeHandle
        direction={direction}
        onResize={onResize}
        splitId={ResizeFixtureSplitId.Primary}
      />
      <div />
    </div>
  );
}

function requireParent(container: HTMLDivElement): HTMLElement {
  const parent = container.firstElementChild;
  if (!(parent instanceof HTMLElement)) {
    throw new TypeError(ResizeTestErrorMessage.ParentMissing);
  }
  return parent;
}

function requirePane(parent: HTMLElement, index: ResizeFixtureChildIndex) {
  const pane = parent.children.item(index);
  if (!(pane instanceof HTMLElement)) {
    throw new TypeError(ResizeTestErrorMessage.PaneMissing);
  }
  return pane;
}

function requireControl(container: HTMLDivElement): HTMLInputElement {
  const control = container.querySelector(ResizeFixtureSelector.Control);
  if (
    !(control instanceof HTMLInputElement) ||
    control.type !== DomInputType.Range
  ) {
    throw new TypeError(ResizeTestErrorMessage.ControlMissing);
  }
  return control;
}

function installGeometry(parent: HTMLElement): void {
  parent.getBoundingClientRect = () =>
    new DOMRect(
      ResizeFixtureDimension.ParentLeft,
      ResizeFixtureDimension.ParentTop,
      ResizeFixtureDimension.ParentWidth,
      ResizeFixtureDimension.ParentHeight,
    );
  const leadingPane = requirePane(
    parent,
    ResizeFixtureChildIndex.LeadingPane,
  );
  const trailingPane = requirePane(
    parent,
    ResizeFixtureChildIndex.TrailingPane,
  );
  const paneRectangle = () =>
    new DOMRect(
      ResizeFixtureDimension.ParentLeft,
      ResizeFixtureDimension.ParentTop,
      ResizeFixtureDimension.PaneWidth,
      ResizeFixtureDimension.PaneHeight,
    );
  leadingPane.getBoundingClientRect = paneRectangle;
  trailingPane.getBoundingClientRect = paneRectangle;
}

export function renderResizeHandle(
  direction: SplitDirectionValue = SplitDirection.Horizontal,
): ResizeHandleFixture {
  const onResize = mock<ResizeCallback>(() => undefined);
  const rendered = renderReact(fixtureElement(direction, onResize));
  const parent = requireParent(rendered.container);
  installGeometry(parent);
  rendered.rerender(fixtureElement(direction, onResize));

  const control = requireControl(rendered.container);
  const capturedPointers = new Set<number>();
  const setPointerCapture = mock((pointerId: number) => {
    capturedPointers.add(pointerId);
  });
  const hasPointerCapture = mock((pointerId: number) =>
    capturedPointers.has(pointerId),
  );
  const releasePointerCapture = mock((pointerId: number) => {
    capturedPointers.delete(pointerId);
  });

  Object.defineProperties(control, {
    hasPointerCapture: {
      configurable: true,
      value: hasPointerCapture,
    },
    releasePointerCapture: {
      configurable: true,
      value: releasePointerCapture,
    },
    setPointerCapture: {
      configurable: true,
      value: setPointerCapture,
    },
  });

  return {
    control,
    onResize,
    releasePointerCapture,
    rendered,
    rerender: (nextOnResize) => {
      rendered.rerender(fixtureElement(direction, nextOnResize));
    },
    setPointerCapture,
  };
}

export function dispatchResizePointer(
  control: HTMLInputElement,
  type: DomEvent,
  clientX: number = ResizeFixtureDimension.ParentLeft,
  clientY: number = ResizeFixtureDimension.ParentTop,
): void {
  act(() => {
    control.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX,
        clientY,
        pointerId: ResizePointerId.Primary,
      }),
    );
  });
}

export function dispatchResizeKey(
  control: HTMLInputElement,
  key: string,
): void {
  act(() => {
    control.dispatchEvent(
      new KeyboardEvent(DomEvent.KeyDown, {
        bubbles: true,
        key,
      }),
    );
  });
}

export function expectLastResize(
  fixture: ResizeHandleFixture,
  expectedRatio: ResizeExpectedRatio,
): void {
  expectResizeCallback(fixture.onResize, expectedRatio);
}

export function expectResizeCallback(
  callback: Mock<ResizeCallback>,
  expectedRatio: ResizeExpectedRatio,
): void {
  const lastCall = callback.mock.calls.at(-1);
  if (lastCall === undefined) {
    throw new TypeError(ResizeTestErrorMessage.CallbackMissing);
  }
  const [splitId, ratio] = lastCall;
  expect(splitId).toBe(ResizeFixtureSplitId.Primary);
  expect(ratio).toBeCloseTo(expectedRatio);
}
