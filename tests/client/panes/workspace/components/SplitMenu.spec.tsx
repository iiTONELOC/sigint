import { describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { Circle } from "lucide-react";
import { SplitMenu } from "@/panes/SplitMenu";
import {
  PANE_CATALOG,
  type PaneCatalog,
  type PaneDefinition,
} from "@/panes/workspace/paneCatalog";
import { PaneType, type PaneTypeValue } from "@/panes/workspace/model/pane";
import { renderReact } from "../../../../support/react";

enum SplitMenuFixtureCount {
  Double = 2,
}

enum SplitMenuFixturePosition {
  Left = 40,
  Top = 60,
}

enum SplitMenuTestErrorMessage {
  ButtonMissing = "The expected split-menu button did not render.",
}

function FixturePane() {
  return null;
}

function fixturePane(paneType: PaneType): PaneDefinition {
  return {
    ...PANE_CATALOG[paneType],
    component: FixturePane,
    icon: Circle,
    label: paneType,
  };
}

const FIXTURE_CATALOG: PaneCatalog = {
  [PaneType.AlertLog]: fixturePane(PaneType.AlertLog),
  [PaneType.DataTable]: fixturePane(PaneType.DataTable),
  [PaneType.Dossier]: fixturePane(PaneType.Dossier),
  [PaneType.Globe]: fixturePane(PaneType.Globe),
  [PaneType.IntelFeed]: fixturePane(PaneType.IntelFeed),
  [PaneType.NewsFeed]: fixturePane(PaneType.NewsFeed),
  [PaneType.RawConsole]: fixturePane(PaneType.RawConsole),
  [PaneType.VideoFeed]: fixturePane(PaneType.VideoFeed),
};

function splitButtons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll("button"));
}

function requireSplitButton(): HTMLButtonElement {
  const [button] = splitButtons();
  if (button === undefined) {
    throw new TypeError(SplitMenuTestErrorMessage.ButtonMissing);
  }
  return button;
}

describe("SplitMenu", () => {
  test("renders pane choices in source order", () => {
    renderReact(
      <SplitMenu
        left={SplitMenuFixturePosition.Left}
        catalog={FIXTURE_CATALOG}
        onSelect={mock(() => undefined)}
        top={SplitMenuFixturePosition.Top}
        types={[PaneType.DataTable, PaneType.Dossier]}
      />,
    );

    const buttons = splitButtons();
    expect(buttons).toHaveLength(SplitMenuFixtureCount.Double);
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      PaneType.DataTable,
      PaneType.Dossier,
    ]);
  });

  test("returns the selected pane type", () => {
    const onSelect = mock((_paneType: PaneTypeValue) => undefined);
    renderReact(
      <SplitMenu
        left={SplitMenuFixturePosition.Left}
        catalog={FIXTURE_CATALOG}
        onSelect={onSelect}
        top={SplitMenuFixturePosition.Top}
        types={[PaneType.DataTable]}
      />,
    );

    act(() => requireSplitButton().click());

    expect(onSelect).toHaveBeenCalledWith(PaneType.DataTable);
  });
});
