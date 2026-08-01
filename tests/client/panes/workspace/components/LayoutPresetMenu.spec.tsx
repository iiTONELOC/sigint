import { describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { LayoutPresetMenu } from "@/panes/LayoutPresetMenu";
import type { LayoutPreset, LayoutState } from "@/panes/paneTree";
import {
  PaneLayoutRatio,
  PaneNodeType,
  PaneType,
  SplitDirection,
} from "@/panes/workspace/model";
import { DomEvent, DomInputType, DomKey } from "@/runtime";
import {
  renderReact,
  setReactInputValue,
} from "../../../../support/react";

enum PresetFixtureCount {
  Empty = 0,
  RowActions = 3,
  Single = 1,
}

enum PresetFixtureInput {
  SavedPadded = "  Saved layout  ",
}

enum PresetFixtureName {
  Analysis = "Analysis",
  Saved = "Saved layout",
  Watch = "Watch Mode",
}

enum PresetFixtureNodeId {
  Minimized = "preset-minimized",
}

enum PresetTestErrorMessage {
  ActionsMissing = "The preset row actions did not render.",
  ButtonMissing = "The expected preset action did not render.",
  InputMissing = "The preset-name input did not render.",
  RowMissing = "The expected preset row did not render.",
}

type PresetRowActions = readonly [
  HTMLButtonElement,
  HTMLButtonElement,
  HTMLButtonElement,
];

function layout(
  paneType: PaneType,
  minimized: LayoutState["minimized"] = [],
): LayoutState {
  return {
    minimized,
    root: {
      id: `preset-${paneType}`,
      paneType,
      type: PaneNodeType.Leaf,
    },
  };
}

function preset(name: PresetFixtureName, state: LayoutState): LayoutPreset {
  return { name, state };
}

function buttonWithText(
  root: ParentNode,
  text: PresetFixtureName,
): HTMLButtonElement | null {
  return (
    Array.from(root.querySelectorAll("button")).find(
      (button) => button.textContent?.includes(text),
    ) ?? null
  );
}

function requireInput(root: ParentNode): HTMLInputElement {
  const input = root.querySelector("input");
  if (
    !(input instanceof HTMLInputElement) ||
    input.type !== DomInputType.Text
  ) {
    throw new TypeError(PresetTestErrorMessage.InputMissing);
  }
  return input;
}

function requireRow(
  root: ParentNode,
  name: PresetFixtureName,
): HTMLElement {
  const row = buttonWithText(root, name)?.parentElement;
  if (!(row instanceof HTMLElement)) {
    throw new TypeError(PresetTestErrorMessage.RowMissing);
  }
  return row;
}

function requireRowActions(row: HTMLElement): PresetRowActions {
  const actions = Array.from(row.querySelectorAll("button"));
  if (
    actions.length !== PresetFixtureCount.RowActions ||
    !actions.every((action) => action instanceof HTMLButtonElement)
  ) {
    throw new TypeError(PresetTestErrorMessage.ActionsMissing);
  }
  const [load, update, remove] = actions;
  if (
    load === undefined ||
    update === undefined ||
    remove === undefined
  ) {
    throw new TypeError(PresetTestErrorMessage.ActionsMissing);
  }
  return [load, update, remove];
}

function requireSaveButton(input: HTMLInputElement): HTMLButtonElement {
  const button = input.parentElement?.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new TypeError(PresetTestErrorMessage.ButtonMissing);
  }
  return button;
}

function renderMenu(
  presets: LayoutPreset[] = [],
  presetsLoaded = true,
) {
  const callbacks = {
    onClose: mock(() => undefined),
    onDelete: mock((_index: number) => undefined),
    onLoad: mock((_preset: LayoutPreset) => undefined),
    onSave: mock((_name: string) => undefined),
    onUpdate: mock((_index: number) => undefined),
  };
  const rendered = renderReact(
    <LayoutPresetMenu
      onClose={callbacks.onClose}
      onDelete={callbacks.onDelete}
      onLoad={callbacks.onLoad}
      onSave={callbacks.onSave}
      onUpdate={callbacks.onUpdate}
      presets={presets}
      presetsLoaded={presetsLoaded}
    />,
  );
  return { ...callbacks, ...rendered };
}

function enterPresetName(
  input: HTMLInputElement,
  name: string,
): void {
  setReactInputValue(input, name);
}

describe("LayoutPresetMenu", () => {
  test("shows saved names and open plus minimized pane counts", () => {
    const minimized: LayoutState["minimized"] = [
      {
        dir: SplitDirection.Horizontal,
        id: PresetFixtureNodeId.Minimized,
        paneType: PaneType.Dossier,
        ratio: PaneLayoutRatio.Equal,
        siblingId: null,
        wasSecond: true,
      },
    ];
    const fixture = renderMenu([
      preset(PresetFixtureName.Watch, layout(PaneType.Globe, minimized)),
      preset(PresetFixtureName.Analysis, layout(PaneType.DataTable)),
    ]);
    const watchButton = buttonWithText(
      fixture.container,
      PresetFixtureName.Watch,
    );

    expect(watchButton).not.toBeNull();
    expect(
      buttonWithText(fixture.container, PresetFixtureName.Analysis),
    ).not.toBeNull();
    expect(watchButton?.textContent).toContain(
      `${PresetFixtureCount.Single}+${PresetFixtureCount.Single}`,
    );
  });

  test("loads a preset and closes the menu", () => {
    const selected = preset(
      PresetFixtureName.Watch,
      layout(PaneType.Globe),
    );
    const fixture = renderMenu([selected]);
    const [load] = requireRowActions(
      requireRow(fixture.container, PresetFixtureName.Watch),
    );

    act(() => load.click());

    expect(fixture.onLoad).toHaveBeenCalledWith(selected);
    expect(fixture.onClose).toHaveBeenCalledTimes(
      PresetFixtureCount.Single,
    );
  });

  test("trims and saves a name with Enter", () => {
    const fixture = renderMenu();
    const input = requireInput(fixture.container);
    enterPresetName(input, PresetFixtureInput.SavedPadded);

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent(DomEvent.KeyDown, {
          bubbles: true,
          key: DomKey.Enter,
        }),
      );
    });

    expect(fixture.onSave).toHaveBeenCalledWith(PresetFixtureName.Saved);
    expect(fixture.onClose).toHaveBeenCalledTimes(
      PresetFixtureCount.Single,
    );
  });

  test("saves through the save action", () => {
    const fixture = renderMenu();
    const input = requireInput(fixture.container);
    enterPresetName(input, PresetFixtureName.Analysis);

    act(() => requireSaveButton(input).click());

    expect(fixture.onSave).toHaveBeenCalledWith(PresetFixtureName.Analysis);
    expect(fixture.onClose).toHaveBeenCalledTimes(
      PresetFixtureCount.Single,
    );
  });

  test("updates and deletes the selected preset", () => {
    const fixture = renderMenu([
      preset(PresetFixtureName.Watch, layout(PaneType.Globe)),
    ]);
    const [, update, remove] = requireRowActions(
      requireRow(fixture.container, PresetFixtureName.Watch),
    );

    act(() => {
      update.click();
      remove.click();
    });

    expect(fixture.onUpdate).toHaveBeenCalledWith(
      PresetFixtureCount.Empty,
    );
    expect(fixture.onDelete).toHaveBeenCalledWith(
      PresetFixtureCount.Empty,
    );
  });

  test("does not save an empty name", () => {
    const fixture = renderMenu();
    const input = requireInput(fixture.container);

    act(() => requireSaveButton(input).click());

    expect(fixture.onSave).not.toHaveBeenCalled();
    expect(fixture.onClose).not.toHaveBeenCalled();
  });

  test("closes for an outside pointer", () => {
    const fixture = renderMenu();

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent(DomEvent.MouseDown, { bubbles: true }),
      );
    });

    expect(fixture.onClose).toHaveBeenCalledTimes(
      PresetFixtureCount.Single,
    );
  });
});
