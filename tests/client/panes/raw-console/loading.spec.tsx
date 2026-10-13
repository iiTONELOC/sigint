import { describe, expect, test } from "bun:test";
import { PaneSkeleton } from "@/panes/workspace/paneCatalog";
import { PaneType } from "@/panes/workspace/model/pane";
import { busyStatus, renderReact } from "../../../support/react";

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
  test("exposes a busy status named after each lazy pane", () => {
    for (const paneType of Object.values(PaneType)) {
      if (paneType === PaneType.Globe) continue;
      const { container } = renderReact(<PaneSkeleton paneType={paneType} />);

      expect([paneType, busyStatus(container)]).toEqual([paneType, { label: LOADING_LABELS[paneType], busy: true }]);
    }
  });
});
