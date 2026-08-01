import { describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { Circle } from "lucide-react";
import { SplitMenu } from "@/panes/SplitMenu";
import type { PaneCatalog } from "@/panes/workspace/paneCatalog";
import {
  PaneType,
  type PaneTypeValue,
} from "@/panes/workspace/model";
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

const FIXTURE_CATALOG: PaneCatalog = {
  [PaneType.AlertLog]: {
    component: FixturePane,
    icon: Circle,
    label: PaneType.AlertLog,
  },
  [PaneType.DataTable]: {
    component: FixturePane,
    icon: Circle,
    label: PaneType.DataTable,
  },
  [PaneType.Dossier]: {
    component: FixturePane,
    icon: Circle,
    label: PaneType.Dossier,
  },
  [PaneType.Globe]: {
    component: FixturePane,
    icon: Circle,
    label: PaneType.Globe,
  },
  [PaneType.IntelFeed]: {
    component: FixturePane,
    icon: Circle,
    label: PaneType.IntelFeed,
  },
  [PaneType.NewsFeed]: {
    component: FixturePane,
    icon: Circle,
    label: PaneType.NewsFeed,
  },
  [PaneType.RawConsole]: {
    component: FixturePane,
    icon: Circle,
    label: PaneType.RawConsole,
  },
  [PaneType.VideoFeed]: {
    component: FixturePane,
    icon: Circle,
    label: PaneType.VideoFeed,
  },
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
