import { describe, test } from "bun:test";
import { PaneSkeleton } from "@/panes/workspace/paneCatalog";
import { PaneType } from "@/panes/workspace/model/pane";
import { expectBusyStatus, renderReact } from "../../../support/react";

type LazyPaneType = Exclude<PaneType, PaneType.Globe>;

const LOADING_LABELS: Readonly<Record<LazyPaneType, string>> = {
  [PaneType.AlertLog]: "Loading alerts",
  [PaneType.DataTable]: "Loading data table",
  [PaneType.Dossier]: "Loading dossier",
  [PaneType.IntelFeed]: "Loading intel feed",
  [PaneType.NewsFeed]: "Loading news feed",
  [PaneType.RawConsole]: "Loading console",
  [PaneType.VideoFeed]: "Loading video feed",
};

describe("PaneSkeleton", () => {
  for (const paneType of Object.values(PaneType)) {
    if (paneType === PaneType.Globe) continue;
    test(`exposes the ${paneType} loading state`, () => {
      const { container } = renderReact(<PaneSkeleton paneType={paneType} />);

      expectBusyStatus(container, LOADING_LABELS[paneType]);
    });
  }
});
