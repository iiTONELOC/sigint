import {
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import {
  act,
  type ReactElement,
} from "react";
import { Circle } from "lucide-react";
import { TooltipPlacement } from "@/components/Tooltip";
import { DeviceType } from "@/layout-mode";
import { PaneType, type PaneTypeValue } from "@/panes/workspace/model/pane";
import { DomEvent } from "@/runtime";
import { PANE_CATALOG } from "@/panes/workspace/paneCatalog";
import {
  renderReact,
  waitForReact,
} from "../../../../support/react";
import {
  requirePaneDragHandle,
  requirePaneHeaderControls,
} from "./PaneHeader.fixture";

enum PaneHeaderFixtureCount {
  Single = 1,
}

enum PaneHeaderFixtureId {
  Leaf = "pane-header-fixture-leaf",
}

enum PaneHeaderFixtureProperty {
  DataTransfer = "dataTransfer",
}

enum PaneHeaderFixtureText {
  Current = "fixture-current-pane",
  Option = "DATA TABLE",
}

enum PaneHeaderTestErrorMessage {
  ButtonMissing = "The expected pane-header button did not render.",
  HeaderMissing = "The pane header did not render.",
}

type PaneHeaderDragEventName =
  | DomEvent.DragEnd
  | DomEvent.DragStart
  | DomEvent.Drop;

type TooltipFixtureProps = Readonly<{
  children: ReactElement;
}>;

mock.module("@/components/Tooltip", () => ({
  Tooltip: ({ children }: TooltipFixtureProps) => children,
  TooltipPlacement,
}));

mock.module("@/layout-mode", () => ({
  useIsMobileLayout: () => false,
  useLayoutMode: () => ({ deviceType: DeviceType.Desktop }),
}));

const { PaneHeader } = await import("@/panes/PaneHeader");

function requireHeader(container: HTMLDivElement): HTMLElement {
  const header = container.firstElementChild;
  if (!(header instanceof HTMLElement)) {
    throw new TypeError(PaneHeaderTestErrorMessage.HeaderMissing);
  }
  return header;
}

function optionButton(): HTMLButtonElement | null {
  return (
    Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(PaneHeaderFixtureText.Option),
    ) ?? null
  );
}

function dragEvent(type: PaneHeaderDragEventName): DragEvent {
  const event = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, PaneHeaderFixtureProperty.DataTransfer, {
    configurable: true,
    value: new DataTransfer(),
  });
  return event;
}

function renderHeader() {
  const callbacks = {
    onChangePaneType: mock((_paneType: PaneTypeValue) => undefined),
    onClose: mock(() => undefined),
    onDragEnd: mock(() => undefined),
    onDragStart: mock((_leafId: string) => undefined),
    onDrop: mock((_leafId: string) => undefined),
    onMinimize: mock(() => undefined),
    onToggleMaximize: mock(() => undefined),
    onToggleFullscreen: mock(() => undefined),
    onSplitH: mock(() => undefined),
    onSplitV: mock(() => undefined),
    onTouchDragStart: mock((_leafId: string) => undefined),
  };
  const rendered = renderReact(
    <PaneHeader
      icon={Circle}
      isFullscreen={false}
      label={PaneHeaderFixtureText.Current}
      leafId={PaneHeaderFixtureId.Leaf}
      onChangePaneType={callbacks.onChangePaneType}
      onClose={callbacks.onClose}
      onDragEnd={callbacks.onDragEnd}
      onDragStart={callbacks.onDragStart}
      onDrop={callbacks.onDrop}
      onMinimize={callbacks.onMinimize}
      onToggleMaximize={callbacks.onToggleMaximize}
      onToggleFullscreen={callbacks.onToggleFullscreen}
      onSplitH={callbacks.onSplitH}
      onSplitV={callbacks.onSplitV}
      onTouchDragStart={callbacks.onTouchDragStart}
      paneCatalog={PANE_CATALOG}
      paneType={PaneType.Globe}
    />,
  );
  return { ...callbacks, ...rendered };
}

describe("PaneHeader", () => {
  test("runs the desktop pane controls", () => {
    const fixture = renderHeader();
    const {
      close,
      fullscreen,
      maximize,
      minimize,
      splitHorizontal,
      splitVertical,
    } = requirePaneHeaderControls(fixture.container);
    if (close === undefined) {
      throw new TypeError(PaneHeaderTestErrorMessage.ButtonMissing);
    }

    expect(
      [
        splitHorizontal,
        splitVertical,
        maximize,
        fullscreen,
        minimize,
        close,
      ].every(
        (button) => (button.getAttribute("aria-label")?.length ?? 0) > 0,
      ),
    ).toBe(true);
    act(() => {
      splitHorizontal.click();
      splitVertical.click();
      maximize.click();
      fullscreen.click();
      minimize.click();
      close.click();
    });

    expect(fixture.onSplitH).toHaveBeenCalledTimes(
      PaneHeaderFixtureCount.Single,
    );
    expect(fixture.onSplitV).toHaveBeenCalledTimes(
      PaneHeaderFixtureCount.Single,
    );
    expect(fixture.onMinimize).toHaveBeenCalledTimes(
      PaneHeaderFixtureCount.Single,
    );
    expect(fixture.onToggleMaximize).toHaveBeenCalledTimes(
      PaneHeaderFixtureCount.Single,
    );
    expect(fixture.onToggleFullscreen).toHaveBeenCalledTimes(
      PaneHeaderFixtureCount.Single,
    );
    expect(fixture.onClose).toHaveBeenCalledTimes(
      PaneHeaderFixtureCount.Single,
    );
  });

  test("changes the pane type through the label menu", async () => {
    const fixture = renderHeader();
    const { type: typeButton } = requirePaneHeaderControls(
      fixture.container,
    );

    act(() => typeButton.click());
    await waitForReact(() => optionButton() !== null);
    const option = optionButton();
    if (option === null) {
      throw new TypeError(PaneHeaderTestErrorMessage.ButtonMissing);
    }
    act(() => option.click());

    expect(fixture.onChangePaneType).toHaveBeenCalledWith(
      PaneType.DataTable,
    );
  });

  test("wires mouse, touch, and drop movement actions", () => {
    const fixture = renderHeader();
    const handle = requirePaneDragHandle(fixture.container);
    const header = requireHeader(fixture.container);

    act(() => {
      handle.dispatchEvent(dragEvent(DomEvent.DragStart));
      handle.dispatchEvent(dragEvent(DomEvent.DragEnd));
      handle.dispatchEvent(
        new TouchEvent(DomEvent.TouchStart, {
          bubbles: true,
          cancelable: true,
        }),
      );
      header.dispatchEvent(dragEvent(DomEvent.Drop));
    });

    expect(fixture.onDragStart).toHaveBeenCalledWith(
      PaneHeaderFixtureId.Leaf,
    );
    expect(fixture.onDragEnd).toHaveBeenCalledTimes(
      PaneHeaderFixtureCount.Single,
    );
    expect(fixture.onTouchDragStart).toHaveBeenCalledWith(
      PaneHeaderFixtureId.Leaf,
    );
    expect(fixture.onDrop).toHaveBeenCalledWith(PaneHeaderFixtureId.Leaf);
  });
});
