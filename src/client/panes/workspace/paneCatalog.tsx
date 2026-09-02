import {
  lazy,
  Suspense,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Bell,
  FileSearch,
  Globe,
  Newspaper,
  Plane,
  Rss,
  Table2,
  Terminal,
  Tv,
  type LucideIcon,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LiveTrafficPane } from "@/panes/live-traffic/LiveTrafficPane";
import type { PaneType } from "@/panes/paneTree";
import { PaneMobileHeight, PaneType as PaneTypeId } from "./model/pane";

type PaneLoadingDefinition = Readonly<{
  icon?: LucideIcon;
  itemCount?: number;
  secondaryItemCount?: number;
  tailClassName?: string;
  titleClassName?: string;
}>;

export type PaneDefinition = Readonly<{
  component: ComponentType;
  icon: LucideIcon;
  label: string;
  loading?: PaneLoadingDefinition;
  mobileHeight: PaneMobileHeight;
  persistent?: boolean;
}>;

export type PaneCatalog = Readonly<Record<PaneType, PaneDefinition>>;

enum PaneSkeletonClassName {
  Action = "h-5 w-5 bg-sig-dim/10 rounded",
  AlertTitle = "h-3 w-16 bg-sig-dim/10 rounded",
  CardList = "flex-1 p-2 space-y-2",
  Fill = "flex-1",
  FullLine = "h-3 w-full bg-sig-dim/8 rounded",
  ItemList = "flex-1 p-2 space-y-1",
  RowHeading = "flex items-center gap-2",
  StandardTitle = "h-3 w-24 bg-sig-dim/10 rounded",
  ThreeQuarterLine = "h-3 w-3/4 bg-sig-dim/8 rounded",
}

enum PaneSkeletonItemCount {
  DataTableRows = 12,
}

const SKELETON_ITEM_KEYS = "abcdefghijklmno";
const CONSOLE_LINE_WIDTHS = [
  "w-[40%]", "w-[44%]", "w-[48%]", "w-[52%]", "w-[56%]",
  "w-[60%]", "w-[64%]", "w-[68%]", "w-[72%]", "w-[76%]",
  "w-[80%]", "w-[84%]", "w-[88%]", "w-[92%]", "w-[95%]",
];

function skeletonItems(count?: number): string[] {
  return count
    ? Array.from(SKELETON_ITEM_KEYS.slice(0, count))
    : [];
}

function SkeletonRepeat({
  children,
  className,
  count,
}: Readonly<{
  children: ReactNode;
  className: string;
  count?: number;
}>) {
  return skeletonItems(count).map((item) => (
    <div key={item} className={className}>
      {children}
    </div>
  ));
}

function SkeletonHeader({
  icon: Icon,
  loading,
  paneType,
}: Readonly<{
  icon: LucideIcon;
  loading: PaneLoadingDefinition;
  paneType: PaneType;
}>) {
  const isConsole = paneType === PaneTypeId.RawConsole;
  const hasTail = loading.tailClassName || paneType === PaneTypeId.VideoFeed;
  let tail: ReactNode = null;
  if (paneType === PaneTypeId.VideoFeed) {
    tail = (
      <div className="flex gap-1">
        <SkeletonRepeat
          className={PaneSkeletonClassName.Action}
          count={loading.secondaryItemCount}
        >
          {null}
        </SkeletonRepeat>
      </div>
    );
  } else if (loading.tailClassName) {
    tail = <div className={loading.tailClassName} />;
  }
  return (
    <div
      className={
        isConsole
          ? "shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-sig-border/40"
          : "shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-sig-border/40"
      }
    >
      <Icon
        aria-hidden
        className={
          isConsole
            ? "w-3 h-3 text-sig-dim/30"
            : "w-3.5 h-3.5 text-sig-dim/30"
        }
      />
      <div
        className={
          loading.titleClassName ?? PaneSkeletonClassName.StandardTitle
        }
      />
      {hasTail && <div className={PaneSkeletonClassName.Fill} />}
      {tail}
    </div>
  );
}

function DossierSkeletonHeader({
  icon: Icon,
  itemCount,
}: Readonly<{ icon: LucideIcon; itemCount?: number }>) {
  return (
    <div className="p-3 pb-0">
      <div className={PaneSkeletonClassName.RowHeading}>
        <Icon aria-hidden className="w-4 h-4 text-sig-dim/30 shrink-0" />
        <div className="h-4 w-32 bg-sig-dim/10 rounded" />
        <div className={PaneSkeletonClassName.Fill} />
        <div className="h-6 w-6 bg-sig-dim/10 rounded" />
      </div>
      <div className="flex items-center gap-1 mt-1.5">
        <SkeletonRepeat className="h-6 w-16 bg-sig-dim/10 rounded" count={itemCount}>
          {null}
        </SkeletonRepeat>
      </div>
    </div>
  );
}

function SkeletonBody({
  loading,
  paneType,
}: Readonly<{ loading: PaneLoadingDefinition; paneType: PaneType }>) {
  switch (paneType) {
    case PaneTypeId.AlertLog:
      return (
        <div className={PaneSkeletonClassName.ItemList}>
          <SkeletonRepeat
            className="flex items-center gap-2 py-1.5 border-l-2 border-sig-dim/15 pl-2"
            count={loading.itemCount}
          >
            <div className="h-5 w-5 bg-sig-dim/10 rounded" />
            <div className="h-3 w-6 bg-sig-dim/15 rounded" />
            <div className="h-3 w-32 bg-sig-dim/8 rounded" />
            <div className={PaneSkeletonClassName.Fill} />
            <div className="h-3 w-10 bg-sig-dim/8 rounded" />
          </SkeletonRepeat>
        </div>
      );
    case PaneTypeId.DataTable:
      return (
        <div className={PaneSkeletonClassName.ItemList}>
          <SkeletonRepeat
            className="flex items-center gap-2 py-1"
            count={loading.itemCount}
          >
            <div className="h-3 w-8 bg-sig-dim/10 rounded" />
            <div className="h-3 w-24 bg-sig-dim/8 rounded" />
            <div className="h-3 w-16 bg-sig-dim/8 rounded" />
            <div className={PaneSkeletonClassName.Fill} />
            <div className="h-3 w-12 bg-sig-dim/8 rounded" />
          </SkeletonRepeat>
        </div>
      );
    case PaneTypeId.Dossier:
      return (
        <div className="flex-1 overflow-hidden p-3 space-y-3">
          <div className="h-36 bg-sig-dim/10 rounded" />
          <SkeletonRepeat className="space-y-1.5" count={loading.itemCount}>
            <div className="h-3 w-20 bg-sig-dim/15 rounded" />
            <div className={PaneSkeletonClassName.FullLine} />
            <div className={PaneSkeletonClassName.ThreeQuarterLine} />
            <div className="h-3 w-1/2 bg-sig-dim/8 rounded" />
          </SkeletonRepeat>
        </div>
      );
    case PaneTypeId.IntelFeed:
      return (
        <div className={PaneSkeletonClassName.CardList}>
          <SkeletonRepeat
            className="p-2 rounded border border-sig-border/20 space-y-1.5"
            count={loading.itemCount}
          >
            <div className={PaneSkeletonClassName.RowHeading}>
              <div className="h-4 w-8 bg-sig-dim/15 rounded" />
              <div className="h-3 w-40 bg-sig-dim/10 rounded" />
            </div>
            <div className={PaneSkeletonClassName.FullLine} />
            <div className="h-3 w-2/3 bg-sig-dim/8 rounded" />
          </SkeletonRepeat>
        </div>
      );
    case PaneTypeId.NewsFeed:
      return (
        <>
          <div className="shrink-0 flex gap-1 px-2 py-1 border-b border-sig-border/20">
            <SkeletonRepeat
              className="h-5 w-16 bg-sig-dim/10 rounded"
              count={loading.secondaryItemCount}
            >
              {null}
            </SkeletonRepeat>
          </div>
          <div className={PaneSkeletonClassName.CardList}>
            <SkeletonRepeat className="space-y-1" count={loading.itemCount}>
              <div className="h-3 w-full bg-sig-dim/10 rounded" />
              <div className={PaneSkeletonClassName.ThreeQuarterLine} />
              <div className="flex gap-2">
                <div className="h-2.5 w-16 bg-sig-dim/8 rounded" />
                <div className="h-2.5 w-20 bg-sig-dim/8 rounded" />
              </div>
            </SkeletonRepeat>
          </div>
        </>
      );
    case PaneTypeId.RawConsole:
      return (
        <div className={PaneSkeletonClassName.ItemList}>
          {CONSOLE_LINE_WIDTHS.map((width) => (
            <div key={width} className={`h-3 bg-sig-dim/8 rounded ${width}`} />
          ))}
        </div>
      );
    case PaneTypeId.VideoFeed:
      return (
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1 p-1">
          <SkeletonRepeat
            className="bg-black/80 rounded flex items-center justify-center"
            count={loading.itemCount}
          >
            <Tv aria-hidden className="w-6 h-6 text-sig-dim/15" />
          </SkeletonRepeat>
        </div>
      );
    case PaneTypeId.Globe:
      return null;
  }
}

export function PaneSkeleton({ paneType }: Readonly<{ paneType: PaneType }>) {
  const definition = PANE_CATALOG[paneType];
  const loading = definition.loading;
  if (!loading) return null;
  const Icon = loading.icon ?? definition.icon;
  return (
    <output
      aria-busy={true}
      aria-label={`Loading ${definition.label.toLowerCase()}`}
      className={`${paneType === PaneTypeId.Dossier ? "" : "w-full "}h-full flex flex-col animate-pulse`}
    >
      {paneType === PaneTypeId.Dossier ? (
        <DossierSkeletonHeader icon={Icon} itemCount={loading.itemCount} />
      ) : (
        <SkeletonHeader icon={Icon} loading={loading} paneType={paneType} />
      )}
      <SkeletonBody loading={loading} paneType={paneType} />
    </output>
  );
}

type PaneLoader = () => Promise<{ default: ComponentType }>;
type LazyPaneDefinition = Omit<PaneDefinition, "component"> &
  Readonly<{ loading: PaneLoadingDefinition }>;

function defineLazyPane(
  paneType: PaneType,
  definition: LazyPaneDefinition,
  load: PaneLoader,
): PaneDefinition {
  const LazyPane = lazy(load);
  function CatalogPane() {
    return (
      <ErrorBoundary name={paneType}>
        <Suspense fallback={<PaneSkeleton paneType={paneType} />}>
          <LazyPane />
        </Suspense>
      </ErrorBoundary>
    );
  }
  return { ...definition, component: CatalogPane };
}

export const PANE_CATALOG: PaneCatalog = {
  [PaneTypeId.AlertLog]: defineLazyPane(
    PaneTypeId.AlertLog,
    {
      icon: Bell,
      label: "ALERTS",
      mobileHeight: PaneMobileHeight.Small,
      loading: {
        itemCount: 8,
        tailClassName: "h-3 w-12 bg-sig-dim/10 rounded",
        titleClassName: PaneSkeletonClassName.AlertTitle,
      },
    },
    async () => ({
      default: (await import("@/panes/alert-log/AlertLogPane")).AlertLogPane,
    }),
  ),
  [PaneTypeId.DataTable]: defineLazyPane(
    PaneTypeId.DataTable,
    {
      icon: Table2,
      label: "DATA TABLE",
      mobileHeight: PaneMobileHeight.Standard,
      loading: {
        itemCount: PaneSkeletonItemCount.DataTableRows,
        tailClassName: "h-3 w-16 bg-sig-dim/10 rounded",
      },
    },
    async () => ({
      default: (await import("@/panes/data-table/DataTablePane")).DataTablePane,
    }),
  ),
  [PaneTypeId.Dossier]: defineLazyPane(
    PaneTypeId.Dossier,
    {
      icon: FileSearch,
      label: "DOSSIER",
      mobileHeight: PaneMobileHeight.Large,
      loading: { icon: Plane, itemCount: 3 },
    },
    async () => ({
      default: (await import("@/panes/dossier/DossierPane")).DossierPane,
    }),
  ),
  [PaneTypeId.Globe]: {
    component: LiveTrafficPane,
    icon: Globe,
    label: "GLOBE",
    mobileHeight: PaneMobileHeight.XXLarge,
    persistent: true,
  },
  [PaneTypeId.IntelFeed]: defineLazyPane(
    PaneTypeId.IntelFeed,
    {
      icon: Newspaper,
      label: "INTEL FEED",
      mobileHeight: PaneMobileHeight.Medium,
      loading: { itemCount: 5 },
    },
    async () => ({
      default: (await import("@/panes/intel-feed/IntelFeedPane")).IntelFeedPane,
    }),
  ),
  [PaneTypeId.NewsFeed]: defineLazyPane(
    PaneTypeId.NewsFeed,
    {
      icon: Rss,
      label: "NEWS FEED",
      mobileHeight: PaneMobileHeight.Standard,
      loading: {
        itemCount: 6,
        secondaryItemCount: 4,
        tailClassName: PaneSkeletonClassName.Action,
      },
    },
    async () => ({
      default: (await import("@/panes/news-feed/NewsFeedPane")).NewsFeedPane,
    }),
  ),
  [PaneTypeId.RawConsole]: defineLazyPane(
    PaneTypeId.RawConsole,
    {
      icon: Terminal,
      label: "CONSOLE",
      mobileHeight: PaneMobileHeight.XSmall,
      loading: { tailClassName: "h-5 w-14 bg-sig-dim/10 rounded" },
    },
    async () => ({
      default: (await import("@/panes/raw-console/RawConsolePane")).RawConsolePane,
    }),
  ),
  [PaneTypeId.VideoFeed]: defineLazyPane(
    PaneTypeId.VideoFeed,
    {
      icon: Tv,
      label: "VIDEO FEED",
      mobileHeight: PaneMobileHeight.XLarge,
      loading: { itemCount: 4, secondaryItemCount: 3 },
    },
    async () => ({
      default: (await import("@/panes/video-feed/VideoFeedPane")).VideoFeedPane,
    }),
  ),
};
