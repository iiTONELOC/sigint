import type { ComponentType } from "react";
import {
  Bell,
  FileSearch,
  Globe,
  Newspaper,
  Rss,
  Table2,
  Terminal,
  Tv,
  type LucideIcon,
} from "lucide-react";
import { AlertLog } from "@/panes/alert-log";
import { DataTable } from "@/panes/data-table";
import { Dossier } from "@/panes/dossier";
import { IntelFeed } from "@/panes/intel-feed";
import { LiveTrafficPane } from "@/panes/live-traffic/LiveTrafficPane";
import { NewsFeed } from "@/panes/news-feed";
import { RawConsole } from "@/panes/raw-console";
import { VideoFeed } from "@/panes/video-feed";
import type { PaneType } from "@/panes/paneTree";
import { PaneType as PaneTypeId } from "./model";

export type PaneDefinition = Readonly<{
  component: ComponentType;
  icon: LucideIcon;
  label: string;
}>;

export type PaneCatalog = Readonly<Record<PaneType, PaneDefinition>>;

export const PANE_CATALOG: PaneCatalog = {
  [PaneTypeId.AlertLog]: {
    component: AlertLog,
    icon: Bell,
    label: "ALERTS",
  },
  [PaneTypeId.DataTable]: {
    component: DataTable,
    icon: Table2,
    label: "DATA TABLE",
  },
  [PaneTypeId.Dossier]: {
    component: Dossier,
    icon: FileSearch,
    label: "DOSSIER",
  },
  [PaneTypeId.Globe]: {
    component: LiveTrafficPane,
    icon: Globe,
    label: "GLOBE",
  },
  [PaneTypeId.IntelFeed]: {
    component: IntelFeed,
    icon: Newspaper,
    label: "INTEL FEED",
  },
  [PaneTypeId.NewsFeed]: {
    component: NewsFeed,
    icon: Rss,
    label: "NEWS FEED",
  },
  [PaneTypeId.RawConsole]: {
    component: RawConsole,
    icon: Terminal,
    label: "CONSOLE",
  },
  [PaneTypeId.VideoFeed]: {
    component: VideoFeed,
    icon: Tv,
    label: "VIDEO FEED",
  },
};
