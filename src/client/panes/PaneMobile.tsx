import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Satellite,
  X,
  Plus,
  GripVertical,
  Columns2,
  Rows2,
  ChevronDown,
  Minus,
  ChevronRight,
  Maximize2,
  Bookmark,
} from "lucide-react";
import type {
  PaneType,
  LeafNode,
  LayoutNode,
  SplitNode,
  LayoutState,
  LayoutPreset,
} from "./paneTree";
import { FULL_WIDTH_ONLY } from "./paneTree";
import { useData } from "@/context/DataContext";
import { isSourceDelivering } from "@shared/domain/sourceStatus";
import { Domain } from "@shared/domain/identity";
import type { SourceStatusEntry } from "@/lib/net/sourceHealth";
import { DomEvent } from "@/runtime";
import { cn } from "@/lib/ui/utils";
import { ResizeHandle } from "./ResizeHandle";
import { LayoutPresetMenu } from "./LayoutPresetMenu";
import { SplitMenu } from "./SplitMenu";
import type { PaneCatalog } from "@/panes/workspace/paneCatalog";
import {
  collectMobileBlocks,
  reconcileMobileBlockOrder,
  type MobileBlock,
} from "@/panes/workspace/utils/mobile";
import {
  PaneDropZone,
  PaneMobileHeight,
  PaneMobileRatio,
  PaneNodeType,
  PaneType as PaneTypeId,
  PaneWorkspaceIconMetric,
  PaneWorkspaceMenuMetric,
  SplitDirection,
  type PaneDropZoneValue,
  type PaneEdgeDropZoneValue,
  type SplitDirectionValue,
} from "@/panes/workspace/model";

// ── Default heights per pane type ────────────────────────────────────

const DEFAULT_HEIGHTS: Record<PaneType, number> = {
  [PaneTypeId.Globe]: PaneMobileHeight.XXLarge,
  [PaneTypeId.DataTable]: PaneMobileHeight.Standard,
  [PaneTypeId.Dossier]: PaneMobileHeight.Large,
  [PaneTypeId.IntelFeed]: PaneMobileHeight.Medium,
  [PaneTypeId.AlertLog]: PaneMobileHeight.Small,
  [PaneTypeId.RawConsole]: PaneMobileHeight.XSmall,
  [PaneTypeId.VideoFeed]: PaneMobileHeight.XLarge,
  [PaneTypeId.NewsFeed]: PaneMobileHeight.Standard,
};

const COUNT_ORDER: readonly Domain[] = [
  Domain.Ships,
  Domain.Events,
  Domain.Quakes,
  Domain.Fires,
  Domain.Weather,
  Domain.Aircraft,
];

enum PaneMobileClassName {
  Accent = "text-sig-accent",
  AccentIcon = "text-sig-accent shrink-0",
  Block = "border-b border-sig-border/40",
  BlockFlex = "flex-1 flex flex-col",
  BlockHeader = "flex items-center gap-0.5 px-1 py-px border-b border-sig-border/40 select-none",
  BlockHeaderIdle = "bg-sig-panel/80",
  BlockHeaderMoveSource = "bg-sig-accent/10",
  BlockMoveSource = "ring-2 ring-sig-accent/70 shadow-[0_0_12px_rgba(0,212,240,0.15)]",
  BodyNoSelect = "select-none",
  FlexFill = "flex-1",
  Grip = "bg-transparent border-none p-1 -ml-0.5 transition-colors touch-target",
  GripIdle = "text-sig-dim hover:text-sig-accent",
  MoveZone = "rounded flex items-center justify-center gap-1 bg-sig-bg/85 border-2 border-dashed border-sig-accent/60 text-sig-accent text-(length:--sig-text-md) tracking-wider font-bold hover:bg-sig-accent/30 active:bg-sig-accent/40 transition-colors",
  MoveZoneFullWidth = "col-span-3",
  StatusCount = "text-(length:--sig-text-sm) tabular-nums font-semibold",
  SwapZone = "rounded flex items-center justify-center gap-1 bg-sig-bg/90 border-2 border-sig-accent/80 text-sig-accent text-(length:--sig-text-md) tracking-wider font-bold hover:bg-sig-accent/30 active:bg-sig-accent/40 transition-colors",
  TabActive = "text-sig-accent bg-sig-accent/10",
  TabInactive = "text-sig-dim bg-transparent",
  TabMinimized = "text-sig-dim/50 bg-transparent",
}

enum PaneMobileGridTrack {
  Collapsed = "36px",
  Flexible = "1fr",
}

enum PaneMobileGridMetric {
  SeparatorPx = 6,
}

type MobileSplitTracks = {
  readonly first: string;
  readonly second: string;
};

function proportionalSplitTracks(node: SplitNode): MobileSplitTracks {
  return {
    first: `${node.ratio}fr`,
    second: `${1 - node.ratio}fr`,
  };
}

function mobileSplitTracks(
  node: SplitNode,
  minimizedLeaves: ReadonlySet<string>,
): MobileSplitTracks {
  const proportionalTracks = proportionalSplitTracks(node);
  if (node.direction !== SplitDirection.Horizontal) {
    return proportionalTracks;
  }

  const [firstChild, secondChild] = node.children;
  const isFirstMinimized =
    firstChild.type === PaneNodeType.Leaf && minimizedLeaves.has(firstChild.id);
  const isSecondMinimized =
    secondChild.type === PaneNodeType.Leaf &&
    minimizedLeaves.has(secondChild.id);
  if (isFirstMinimized === isSecondMinimized) {
    return proportionalTracks;
  }
  if (isFirstMinimized) {
    return {
      first: PaneMobileGridTrack.Collapsed,
      second: PaneMobileGridTrack.Flexible,
    };
  }
  return {
    first: PaneMobileGridTrack.Flexible,
    second: PaneMobileGridTrack.Collapsed,
  };
}

function horizontalLeafId(
  splitNode: SplitNode,
  childNode: LayoutNode,
): string | undefined {
  if (
    splitNode.direction !== SplitDirection.Horizontal ||
    childNode.type !== PaneNodeType.Leaf
  ) {
    return undefined;
  }
  return childNode.id;
}

function mobileTabStateClassName(
  isActive: boolean,
  isMinimized: boolean,
): PaneMobileClassName {
  if (isActive) {
    return PaneMobileClassName.TabActive;
  }
  if (isMinimized) {
    return PaneMobileClassName.TabMinimized;
  }
  return PaneMobileClassName.TabInactive;
}

function moveSourcePaneType(
  allLeaves: readonly LeafNode[],
  moveSourceLeafId: string | null,
): PaneType | undefined {
  if (moveSourceLeafId === null) {
    return undefined;
  }
  return allLeaves.find((leaf) => leaf.id === moveSourceLeafId)?.paneType;
}

function isMoveSourceBlock(
  block: MobileBlock,
  moveSourceLeafId: string | null,
): boolean {
  return (
    moveSourceLeafId !== null && block.leafIds.includes(moveSourceLeafId)
  );
}

function isMoveTargetBlock(
  block: MobileBlock,
  moveSourceLeafId: string | null,
): boolean {
  return (
    moveSourceLeafId !== null && !block.leafIds.includes(moveSourceLeafId)
  );
}

function allowsBesideMove(
  sourceType: PaneType | undefined,
  targetType: PaneType,
): boolean {
  if (sourceType === undefined) {
    return false;
  }
  return !FULL_WIDTH_ONLY.has(sourceType) && !FULL_WIDTH_ONLY.has(targetType);
}

// ── Types ────────────────────────────────────────────────────────────

type PaneMobileProps = {
  readonly allLeaves: LeafNode[];
  readonly layout: LayoutState;
  readonly activeMobilePane: number;
  readonly setActiveMobilePane: (idx: number) => void;
  readonly activeCount: number;
  readonly dataSources: readonly SourceStatusEntry[];
  readonly counts: Record<string, number>;
  readonly paneCatalog: PaneCatalog;
  readonly closePane: (leafId: string) => void;
  readonly minimizePane: (leafId: string, paneType: PaneType) => void;
  readonly changePaneType: (leafId: string, newType: PaneType) => void;
  readonly restorePane: (idx: number) => void;
  readonly splitPane: (
    leafId: string,
    dir: SplitDirectionValue,
    newType: PaneType,
  ) => void;
  readonly resizeSplit: (splitId: string, ratio: number) => void;
  readonly availableTypes: PaneType[];
  readonly leafCount: number;
  readonly swapPanes: (sourceLeafId: string, targetLeafId: string) => void;
  readonly insertPaneBeside: (
    sourceLeafId: string,
    targetLeafId: string,
    zone: PaneEdgeDropZoneValue,
  ) => void;
  readonly presets?: LayoutPreset[];
  readonly presetsLoaded?: boolean;
  readonly onLoadPreset?: (p: LayoutPreset) => void;
  readonly onSavePreset?: (name: string) => void;
  readonly onUpdatePreset?: (idx: number) => void;
  readonly onDeletePreset?: (idx: number) => void;
};

// ── Component ────────────────────────────────────────────────────────

export function PaneMobile({
  allLeaves,
  layout,
  activeMobilePane,
  setActiveMobilePane,
  activeCount,
  dataSources,
  counts,
  paneCatalog,
  closePane,
  minimizePane,
  changePaneType,
  restorePane,
  splitPane,
  resizeSplit,
  availableTypes,
  leafCount: totalLeafCount,
  swapPanes,
  insertPaneBeside,
  presets,
  presetsLoaded,
  onLoadPreset,
  onSavePreset,
  onUpdatePreset,
  onDeletePreset,
}: PaneMobileProps) {
  const { colorMap, chromeHidden } = useData();
  const [showPresets, setShowPresets] = useState(false);

  // ── Build blocks from layout tree ──────────────────────────────
  const rawBlocks = useMemo(
    () => collectMobileBlocks(layout.root),
    [layout.root],
  );

  // ── Block ordering ─────────────────────────────────────────────
  const [order, setOrder] = useState<string[]>(() =>
    rawBlocks.map((b) => b.id),
  );

  const prevBlockIdsRef = useRef(new Set(rawBlocks.map((b) => b.id)));
  useEffect(() => {
    const currentIds = new Set(rawBlocks.map((b) => b.id));
    const prevIds = prevBlockIdsRef.current;

    const added: string[] = [];
    for (const id of currentIds) {
      if (!prevIds.has(id)) added.push(id);
    }

    const removed = new Set<string>();
    for (const id of prevIds) {
      if (!currentIds.has(id)) removed.add(id);
    }

    if (added.length > 0 || removed.size > 0) {
      setOrder((previousOrder) =>
        reconcileMobileBlockOrder(previousOrder, added, removed),
      );

      const addedId = added.at(-1);
      if (addedId !== undefined) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`mobile-block-${addedId}`);
          el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    }

    prevBlockIdsRef.current = currentIds;
  }, [rawBlocks]);

  const blockMap = useMemo(() => {
    const m = new Map<string, MobileBlock>();
    for (const b of rawBlocks) m.set(b.id, b);
    return m;
  }, [rawBlocks]);

  const orderedBlocks = useMemo(
    () =>
      order
        .map((id) => blockMap.get(id))
        .filter((block): block is MobileBlock => block !== undefined),
    [order, blockMap],
  );

  // ── Per-block heights ──────────────────────────────────────────
  const [heights, setHeights] = useState<Record<string, number>>({});

  // ── Minimized blocks (collapsed to header only) ────────────────
  const [minimizedBlocks, setMinimizedBlocks] = useState<Set<string>>(
    new Set(),
  );

  const toggleMinimize = useCallback((blockId: string) => {
    setMinimizedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }, []);

  // ── Per-leaf minimize within split blocks ──────────────────────
  const [minimizedLeaves, setMinimizedLeaves] = useState<Set<string>>(
    new Set(),
  );

  const toggleLeafMinimize = useCallback((leafId: string) => {
    setMinimizedLeaves((prev) => {
      const next = new Set(prev);
      if (next.has(leafId)) next.delete(leafId);
      else next.add(leafId);
      return next;
    });
  }, []);

  // ── Visibility tracking (IntersectionObserver) ──────────────────
  const [visibleSet, setVisibleSet] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const paneRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisibleSet((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.blockId;
            if (!id) continue;
            if (entry.isIntersecting) next.add(id);
            else next.delete(id);
          }
          return next;
        });
      },
      { rootMargin: "200px 0px" },
    );
    return () => observerRef.current?.disconnect();
  }, []);

  const setBlockRef = useCallback((id: string, el: HTMLDivElement | null) => {
    const obs = observerRef.current;
    const prev = paneRefs.current.get(id);
    if (prev && obs) obs.unobserve(prev);
    if (el) {
      paneRefs.current.set(id, el);
      if (obs) obs.observe(el);
    } else {
      paneRefs.current.delete(id);
    }
  }, []);

  // ── Height resize ───────────────────────────────────────────────
  const handleHeightDrag = useCallback(
    (blockId: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const block = blockMap.get(blockId);
      const startH =
        heights[blockId] ??
        DEFAULT_HEIGHTS[block?.primaryLeaf.paneType ?? PaneTypeId.Globe];
      document.body.classList.add(PaneMobileClassName.BodyNoSelect);

      const onMove = (ev: PointerEvent) => {
        const dy = ev.clientY - startY;
        setHeights((prev) => ({
          ...prev,
          [blockId]: Math.max(
            PaneMobileHeight.Minimum,
            Math.min(
              window.innerHeight * PaneMobileRatio.MaximumViewportHeight,
              startH + dy,
            ),
          ),
        }));
      };
      const onUp = () => {
        document.removeEventListener(DomEvent.PointerMove, onMove);
        document.removeEventListener(DomEvent.PointerUp, onUp);
        document.body.classList.remove(PaneMobileClassName.BodyNoSelect);
      };
      document.addEventListener(DomEvent.PointerMove, onMove);
      document.addEventListener(DomEvent.PointerUp, onUp);
    },
    [heights, blockMap],
  );

  // ── Move mode: use leaf IDs directly ───────────────────────────
  // Tap any grip (block-level or per-leaf inside split) to enter move mode.
  // moveSourceLeafId stores the leaf ID being moved.
  const [moveSourceLeafId, setMoveSourceLeafId] = useState<string | null>(null);

  const handleGripTap = useCallback((leafId: string) => {
    setMoveSourceLeafId((prev) => (prev === leafId ? null : leafId));
  }, []);

  const handleMoveAction = useCallback(
    (targetBlockId: string, zone: PaneDropZoneValue) => {
      if (!moveSourceLeafId) return;

      const targetBlock = blockMap.get(targetBlockId);
      if (!targetBlock) return;

      const tgtLeafId = targetBlock.primaryLeaf.id;
      if (moveSourceLeafId === tgtLeafId) return;

      if (zone === PaneDropZone.Center) {
        swapPanes(moveSourceLeafId, tgtLeafId);
      } else {
        insertPaneBeside(moveSourceLeafId, tgtLeafId, zone);
      }

      setMoveSourceLeafId(null);
    },
    [moveSourceLeafId, blockMap, swapPanes, insertPaneBeside],
  );

  // ── Active block tracking (for add-pane targeting) ──────────────
  const [activeInView, setActiveInView] = useState<string | null>(
    orderedBlocks[0]?.id ?? null,
  );

  // ── Add pane ────────────────────────────────────────────────────
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addDropRef = useRef<HTMLDivElement>(null);

  const handleAddPane = useCallback(
    (type: PaneType) => {
      const lastBlock = orderedBlocks.at(-1);
      const activeBlock = activeInView
        ? blockMap.get(activeInView)
        : lastBlock;
      const target = activeBlock ?? lastBlock;
      if (target) {
        const leafId = target.primaryLeaf.id;
        splitPane(leafId, SplitDirection.Vertical, type);
      }
      setAddMenuOpen(false);
    },
    [orderedBlocks, blockMap, activeInView, splitPane],
  );

  useEffect(() => {
    if (!addMenuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        addBtnRef.current &&
        !addBtnRef.current.contains(target) &&
        !addDropRef.current?.contains(target)
      ) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener(DomEvent.MouseDown, onDown, true);
    document.addEventListener(DomEvent.TouchStart, onDown, true);
    return () => {
      document.removeEventListener(DomEvent.MouseDown, onDown, true);
      document.removeEventListener(DomEvent.TouchStart, onDown, true);
    };
  }, [addMenuOpen]);

  // ── Split menu ──────────────────────────────────────────────────
  const [splitMenu, setSplitMenu] = useState<{
    leafId: string;
    dir: SplitDirectionValue;
    top: number;
    left: number;
  } | null>(null);
  const splitMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!splitMenu) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        splitMenuRef.current &&
        !splitMenuRef.current.contains(e.target as Node)
      )
        setSplitMenu(null);
    };
    document.addEventListener(DomEvent.MouseDown, handler);
    document.addEventListener(DomEvent.TouchStart, handler);
    return () => {
      document.removeEventListener(DomEvent.MouseDown, handler);
      document.removeEventListener(DomEvent.TouchStart, handler);
    };
  }, [splitMenu]);

  // ── Type switcher menu ──────────────────────────────────────────
  const [typeMenu, setTypeMenu] = useState<{
    leafId: string;
    top: number;
    left: number;
  } | null>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typeMenu) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        typeMenuRef.current &&
        !typeMenuRef.current.contains(e.target as Node)
      )
        setTypeMenu(null);
    };
    document.addEventListener(DomEvent.MouseDown, handler);
    document.addEventListener(DomEvent.TouchStart, handler);
    return () => {
      document.removeEventListener(DomEvent.MouseDown, handler);
      document.removeEventListener(DomEvent.TouchStart, handler);
    };
  }, [typeMenu]);

  // ── Tab bar scroll-to + active tracking ─────────────────────────
  const scrollToBlock = useCallback((blockId: string) => {
    const el = document.getElementById(`mobile-block-${blockId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const tabObsRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    tabObsRef.current?.disconnect();

    const intersecting = new Map<string, number>();

    tabObsRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.blockId;
          if (!id) continue;
          if (entry.isIntersecting) {
            intersecting.set(id, entry.boundingClientRect.top);
          } else {
            intersecting.delete(id);
          }
        }
        let bestId: string | null = null;
        let bestTop = Infinity;
        for (const [id, top] of intersecting) {
          if (top < bestTop) {
            bestTop = top;
            bestId = id;
          }
        }
        if (bestId) setActiveInView(bestId);
      },
      { rootMargin: "0px 0px -50% 0px" },
    );
    for (const el of paneRefs.current.values()) {
      tabObsRef.current.observe(el);
    }
    return () => tabObsRef.current?.disconnect();
  }, [orderedBlocks]);

  // ── Render leaf content ─────────────────────────────────────────
  const renderLeafContent = useCallback(
    (lf: LeafNode, isVisible: boolean) => {
      if (!isVisible) {
        const meta = paneCatalog[lf.paneType];
        return (
          <div className="w-full h-full flex items-center justify-center bg-sig-bg/50">
            <span className="text-sig-dim text-(length:--sig-text-sm) tracking-wider">
              {meta.label}
            </span>
          </div>
        );
      }
      const PaneComponent = paneCatalog[lf.paneType].component;
      return <PaneComponent />;
    },
    [paneCatalog],
  );

  // ── Render a single leaf with its own mini header ────────────────
  const renderLeafWithHeader = useCallback(
    (lf: LeafNode, isVisible: boolean, siblingLeafId?: string) => {
      const lfMeta = paneCatalog[lf.paneType];
      const LfIcon = lfMeta.icon;
      const PaneComponent = paneCatalog[lf.paneType].component;
      const isLeafMin = minimizedLeaves.has(lf.id);

      // ── Minimized: vertical sidebar you can tap to expand ──────
      if (isLeafMin) {
        return (
          <button
            onClick={() => toggleLeafMinimize(lf.id)}
            className="w-full h-full flex flex-col items-center justify-center gap-2 bg-sig-panel/60 border-none cursor-pointer hover:bg-sig-accent/10 transition-colors"
            title={`Expand ${lfMeta.label}`}
          >
            <LfIcon
              size={PaneWorkspaceIconMetric.MediumSize}
              strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
              className={PaneMobileClassName.AccentIcon}
            />
            <span className="text-sig-accent tracking-widest text-(length:--sig-text-sm) font-semibold [writing-mode:vertical-lr] [text-orientation:mixed]">
              {lfMeta.label}
            </span>
            <ChevronRight
              size={PaneWorkspaceIconMetric.CompactSize}
              strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
              className="text-sig-dim"
            />
          </button>
        );
      }

      // ── Expanded: normal header + content ──────────────────────
      return (
        <div className="flex flex-col w-full h-full min-w-0 min-h-0 overflow-hidden">
          {/* Per-pane header */}
          <div className="shrink-0 flex flex-wrap items-center gap-0.5 px-1 py-px bg-sig-panel/80 border-b border-sig-border/40 select-none">
          {/* Tap the move grip to move this leaf. */}
            <button
              onClick={() => handleGripTap(lf.id)}
              className={cn(
                PaneMobileClassName.Grip,
                moveSourceLeafId === lf.id
                  ? PaneMobileClassName.Accent
                  : PaneMobileClassName.GripIdle,
              )}
              title={
                moveSourceLeafId === lf.id ? "Cancel move" : "Move this pane"
              }
            >
              <GripVertical
                size={PaneWorkspaceIconMetric.SmallSize}
                strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
              />
            </button>

            <button
              onClick={(e) => {
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                setTypeMenu((prev) =>
                  prev?.leafId === lf.id
                    ? null
                    : {
                        leafId: lf.id,
                        top: rect.bottom + 2,
                        left: rect.left,
                      },
                );
              }}
              className="flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer group touch-target"
            >
              <LfIcon
                size={PaneWorkspaceIconMetric.CompactSize}
                strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                className={PaneMobileClassName.AccentIcon}
              />
              <span className="text-sig-accent tracking-wider text-(length:--sig-text-sm) font-semibold group-hover:text-sig-bright transition-colors truncate">
                {lfMeta.label}
              </span>
              <ChevronDown
                size={PaneWorkspaceIconMetric.XSmallSize}
                strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                className="text-sig-dim shrink-0"
              />
            </button>

            <div className={PaneMobileClassName.FlexFill} />

            <div className="flex items-center gap-0.5 shrink-0">
              {/* Extract the pane from the split into its own block. */}
              {siblingLeafId && (
                <button
                  onClick={() =>
                    insertPaneBeside(lf.id, siblingLeafId, PaneDropZone.Bottom)
                  }
                  className="p-0.5 touch-target rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                  title="Pop out to own block"
                >
                  <Maximize2
                    size={PaneWorkspaceIconMetric.CompactSize}
                    strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                  />
                </button>
              )}

              {/* Minimize within split */}
              <button
                onClick={() => toggleLeafMinimize(lf.id)}
                className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                title="Minimize"
              >
                <Minus
                  size={PaneWorkspaceIconMetric.CompactSize}
                  strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                />
              </button>

              {/* Close just this pane */}
              {totalLeafCount > 1 && (
                <button
                  onClick={() => closePane(lf.id)}
                  className="p-0.5 touch-target rounded text-sig-dim bg-transparent border-none hover:text-sig-danger hover:bg-sig-danger/10 transition-colors"
                  title={`Close ${lfMeta.label}`}
                >
                  <X
                    size={PaneWorkspaceIconMetric.CompactSize}
                    strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                  />
                </button>
              )}
            </div>
          </div>

          {/* Pane content */}
          <div className="flex-1 relative overflow-hidden">
            {isVisible ? (
              <PaneComponent />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-sig-bg/50">
                <span className="text-sig-dim text-(length:--sig-text-sm) tracking-wider">
                  {lfMeta.label}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    },
    [
      paneCatalog,
      closePane,
      totalLeafCount,
      setTypeMenu,
      minimizedLeaves,
      toggleLeafMinimize,
      insertPaneBeside,
      handleGripTap,
      moveSourceLeafId,
    ],
  );

  // ── Render a layout node recursively (for H-splits within a block) ──
  const renderMobileNode = useCallback(
    (
      node: LayoutNode,
      isVisible: boolean,
      isTopLevel: boolean,
    ): React.ReactNode => {
      if (node.type === PaneNodeType.Leaf) {
        if (!isTopLevel) {
          return renderLeafWithHeader(node, isVisible);
        }
        return renderLeafContent(node, isVisible);
      }

      const tracks = mobileSplitTracks(node, minimizedLeaves);
      const leftSiblingId = horizontalLeafId(node, node.children[1]);
      const rightSiblingId = horizontalLeafId(node, node.children[0]);

      return (
        <div
          key={node.id}
          className="w-full h-full min-w-0 min-h-0 overflow-hidden"
          style={{
            display: "grid",
            [node.direction === SplitDirection.Horizontal
              ? "gridTemplateColumns"
              : "gridTemplateRows"]:
              `${tracks.first} ${PaneMobileGridMetric.SeparatorPx}px ${tracks.second}`,
          }}
        >
          <div className="overflow-hidden min-w-0 min-h-0">
            {node.children[0].type === PaneNodeType.Leaf && !isTopLevel
              ? renderLeafWithHeader(node.children[0], isVisible, leftSiblingId)
              : renderMobileNode(node.children[0], isVisible, false)}
          </div>
          <ResizeHandle
            splitId={node.id}
            direction={node.direction}
            onResize={resizeSplit}
          />
          <div className="overflow-hidden min-w-0 min-h-0">
            {node.children[1].type === PaneNodeType.Leaf && !isTopLevel
              ? renderLeafWithHeader(
                  node.children[1],
                  isVisible,
                  rightSiblingId,
                )
              : renderMobileNode(node.children[1], isVisible, false)}
          </div>
        </div>
      );
    },
    [renderLeafContent, renderLeafWithHeader, resizeSplit, minimizedLeaves],
  );

  // ── Get label for a block ───────────────────────────────────────
  const getBlockLabel = useCallback(
    (block: MobileBlock) => {
      if (block.node.type === PaneNodeType.Leaf) {
        return paneCatalog[block.node.paneType].label;
      }
      const labels = block.leafIds
        .map((id) => {
          const leaf = allLeaves.find((l) => l.id === id);
          return leaf ? paneCatalog[leaf.paneType].label : null;
        })
        .filter(Boolean);
      if (labels.length <= 2) return labels.join(" | ");
      return `${labels[0]} +${labels.length - 1}`;
    },
    [paneCatalog, allLeaves],
  );
  const moveSourceType = moveSourcePaneType(allLeaves, moveSourceLeafId);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* ── Portaled menus ───────────────────────────────────────── */}

      {splitMenu && (
        <SplitMenu
          ref={splitMenuRef}
          types={availableTypes}
          catalog={paneCatalog}
          top={splitMenu.top}
          left={splitMenu.left}
          wtMenu
          className="fixed z-80 rounded overflow-hidden bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-48"
          onSelect={(type) => {
            splitPane(splitMenu.leafId, splitMenu.dir, type);
            setSplitMenu(null);
          }}
        />
      )}

      {typeMenu &&
        createPortal(
          <div
            ref={typeMenuRef}
            className="fixed z-80 bg-sig-panel border border-sig-border/60 rounded shadow-lg py-0.5 min-w-48"
            style={{
              top: typeMenu.top,
              left: Math.min(
                typeMenu.left,
                window.innerWidth - PaneWorkspaceMenuMetric.BoundaryWidth,
              ),
            }}
          >
            {Object.values(PaneTypeId)
              .filter((paneType) => {
                const leaf = allLeaves.find((l) => l.id === typeMenu.leafId);
                return leaf && paneType !== leaf.paneType;
              })
              .map((paneType) => {
                const definition = paneCatalog[paneType];
                const OptIcon = definition.icon;
                return (
                  <button
                    key={paneType}
                    onClick={() => {
                      changePaneType(typeMenu.leafId, paneType);
                      setTypeMenu(null);
                    }}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 bg-transparent border-none text-left hover:bg-sig-accent/10 transition-colors min-h-11"
                  >
                    <OptIcon
                      size={PaneWorkspaceIconMetric.ToolbarSize}
                      strokeWidth={PaneWorkspaceIconMetric.LightStroke}
                      className="text-sig-dim shrink-0"
                    />
                    <span className="text-sig-bright text-(length:--sig-text-md) tracking-wide">
                      {definition.label}
                    </span>
                  </button>
                );
              })}
          </div>,
          document.body,
        )}

      {/* ── Status bar ──────────────────────────────────────────── */}
      {!chromeHidden && (
        <div className="shrink-0 flex flex-col items-center gap-0 px-2 py-0.5 border-b border-sig-border/30 bg-sig-panel/60">
          <div className="flex items-center gap-2 sm:hidden">
            {COUNT_ORDER.map((key) => {
              const count = counts[key] ?? 0;
              return (
                <span
                  key={key}
                  className={PaneMobileClassName.StatusCount}
                  style={{
                    color: count > 0 ? colorMap[key] : undefined,
                    opacity: count > 0 ? 1 : 0.3,
                  }}
                >
                  {count > 0 ? count.toLocaleString() : "0"}
                </span>
              );
            })}
            {(counts.cyclones ?? 0) > 0 && (
              <span
                className={PaneMobileClassName.StatusCount}
                style={{ color: colorMap.cyclones }}
              >
                {(counts.cyclones ?? 0).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Satellite
              size={PaneWorkspaceIconMetric.CompactSize}
              strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
              className={PaneMobileClassName.AccentIcon}
            />
            <span className="text-sig-accent font-semibold tabular-nums text-(length:--sig-text-sm)">
              {activeCount.toLocaleString()}
            </span>
            <span className="text-sig-dim text-(length:--sig-text-sm) tracking-wider">
              TRACKS
            </span>
            <span className="text-sig-dim text-(length:--sig-text-sm)">
              ·{" "}
              {
                dataSources.filter((source) =>
                  isSourceDelivering(source.status),
                ).length
              }
              /{dataSources.length} LIVE
            </span>
          </div>
        </div>
      )}

      {/* ── Sticky tab bar ──────────────────────────────────────── */}
      {!chromeHidden && (
        <div className="shrink-0 sticky top-0 z-30 flex items-center flex-wrap gap-1 px-2 py-1 border-b border-sig-border/50 bg-sig-panel/95 backdrop-blur-sm">
          {orderedBlocks.map((block) => {
            const meta = paneCatalog[block.primaryLeaf.paneType];
            const Icon = meta.icon;
            const isActive = activeInView === block.id;
            const isMinimized = minimizedBlocks.has(block.id);
            return (
              <button
                key={block.id}
                onClick={() => {
                  if (isMinimized) toggleMinimize(block.id);
                  scrollToBlock(block.id);
                }}
                className={`flex items-center gap-1 px-2 py-1.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors min-h-8 ${
                  mobileTabStateClassName(isActive, isMinimized)
                }`}
              >
                <Icon
                  size={PaneWorkspaceIconMetric.MediumSize}
                  strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                />
                <span>
                  {block.node.type === PaneNodeType.Leaf
                    ? meta.label
                    : getBlockLabel(block)}
                </span>
              </button>
            );
          })}

          {layout.minimized.map((m, i) => {
            const meta = paneCatalog[m.paneType];
            const Icon = meta.icon;
            return (
              <button
                key={m.id}
                onClick={() => restorePane(i)}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-sig-panel/80 opacity-50 min-h-8"
                title={`Restore ${meta.label}`}
              >
                <Icon
                  size={PaneWorkspaceIconMetric.MediumSize}
                  strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                />
                {meta.label}
              </button>
            );
          })}

          {availableTypes.length > 0 && (
            <button
              ref={addBtnRef}
              onClick={() => setAddMenuOpen((o) => !o)}
              className="flex items-center justify-center px-2 py-1.5 min-h-8 min-w-8 rounded text-sig-dim hover:text-sig-accent transition-colors shrink-0"
              title="Add pane"
            >
              <Plus
                size={PaneWorkspaceIconMetric.LargeSize}
                strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
              />
            </button>
          )}

          {addMenuOpen &&
            addBtnRef.current &&
            createPortal(
              <div
                ref={addDropRef}
                className="fixed z-80 rounded bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-48 py-1"
                style={{
                  top: addBtnRef.current.getBoundingClientRect().bottom + 4,
                  left: Math.min(
                    addBtnRef.current.getBoundingClientRect().left,
                    window.innerWidth - PaneWorkspaceMenuMetric.BoundaryWidth,
                  ),
                }}
              >
                {availableTypes.map((type) => {
                  const meta = paneCatalog[type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => handleAddPane(type)}
                      className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-left text-sig-text text-(length:--sig-text-md) bg-transparent border-none hover:bg-sig-accent/10 transition-colors"
                    >
                      <Icon
                        size={PaneWorkspaceIconMetric.LargeSize}
                        strokeWidth={PaneWorkspaceIconMetric.LightStroke}
                        className={PaneMobileClassName.Accent}
                      />
                      {meta.label}
                    </button>
                  );
                })}
              </div>,
              document.body,
            )}

          {/* VIEWS layout presets */}
          {presets && onLoadPreset && (
            <div className="relative ml-auto shrink-0">
              <button
                data-tour="views-btn"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setShowPresets((v) => !v);
                }}
                className="flex items-center gap-1 px-2 py-1.5 min-h-8 rounded text-sig-dim text-(length:--sig-text-sm) hover:text-sig-accent transition-colors"
                title="Layout presets"
              >
                <Bookmark
                  size={PaneWorkspaceIconMetric.MediumSize}
                  strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                />
                VIEWS
              </button>
              {showPresets && (
                <LayoutPresetMenu
                  presets={presets}
                  presetsLoaded={presetsLoaded ?? true}
                  onLoad={(p) => {
                    onLoadPreset(p);
                    setShowPresets(false);
                  }}
                  onSave={(name) => {
                    onSavePreset?.(name);
                  }}
                  onUpdate={(idx) => {
                    onUpdatePreset?.(idx);
                  }}
                  onDelete={(idx) => {
                    onDeletePreset?.(idx);
                  }}
                  onClose={() => setShowPresets(false)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Scrollable block column ─────────────────────────────── */}
      <div
        className={`flex-1 overflow-y-auto sigint-scroll ${orderedBlocks.length === 1 ? "flex flex-col" : ""}`}
      >
        {orderedBlocks.map((block) => {
          const meta = paneCatalog[block.primaryLeaf.paneType];
          const Icon = meta.icon;
          const rawH =
            heights[block.id] ?? DEFAULT_HEIGHTS[block.primaryLeaf.paneType];
          const useFlexFill = orderedBlocks.length === 1 && !heights[block.id];
          const isVisible = visibleSet.has(block.id);
          const isMinimized = minimizedBlocks.has(block.id);
          const isMoveSource = isMoveSourceBlock(block, moveSourceLeafId);
          const isMoveTarget = isMoveTargetBlock(block, moveSourceLeafId);
          const allowBeside = allowsBesideMove(
            moveSourceType,
            block.primaryLeaf.paneType,
          );

          return (
            <div
              key={block.id}
              id={`mobile-block-${block.id}`}
              data-block-id={block.id}
              data-pane-id={block.primaryLeaf.id}
              data-tour={
                block.primaryLeaf.paneType === PaneTypeId.Globe
                  ? "globe-pane"
                  : undefined
              }
              ref={(el) => setBlockRef(block.id, el)}
              className={cn(
                PaneMobileClassName.Block,
                useFlexFill && PaneMobileClassName.BlockFlex,
                isMoveSource && PaneMobileClassName.BlockMoveSource,
              )}
            >
              {/* Block header */}
              <div
                className={cn(
                  PaneMobileClassName.BlockHeader,
                  isMoveSource
                    ? PaneMobileClassName.BlockHeaderMoveSource
                    : PaneMobileClassName.BlockHeaderIdle,
                )}
              >
                <button
                  onClick={() => handleGripTap(block.primaryLeaf.id)}
                  className={cn(
                    PaneMobileClassName.Grip,
                    isMoveSource
                      ? PaneMobileClassName.Accent
                      : PaneMobileClassName.GripIdle,
                  )}
                  title={isMoveSource ? "Cancel move" : "Move this block"}
                >
                  <GripVertical
                    size={PaneWorkspaceIconMetric.CompactSize}
                    strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                  />
                </button>

                {block.node.type === PaneNodeType.Leaf ? (
                  <button
                    onClick={(e) => {
                      const rect = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();
                      setTypeMenu((prev) =>
                        prev?.leafId === block.primaryLeaf.id
                          ? null
                          : {
                              leafId: block.primaryLeaf.id,
                              top: rect.bottom + 2,
                              left: rect.left,
                            },
                      );
                    }}
                    className="flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer group touch-target"
                  >
                    <Icon
                      size={PaneWorkspaceIconMetric.ToolbarSize}
                      strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                      className={PaneMobileClassName.AccentIcon}
                    />
                    <span className="text-sig-accent tracking-wider text-(length:--sig-text-sm) font-semibold group-hover:text-sig-bright transition-colors">
                      {meta.label}
                    </span>
                    <ChevronDown
                      size={PaneWorkspaceIconMetric.SmallSize}
                      strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                      className="text-sig-dim group-hover:text-sig-accent transition-colors"
                    />
                  </button>
                ) : (
                  <span className="text-sig-dim tracking-wider text-(length:--sig-text-sm)">
                    SPLIT
                  </span>
                )}

                <div className={PaneMobileClassName.FlexFill} />

                {block.node.type === PaneNodeType.Leaf &&
                  availableTypes.length > 0 &&
                  !moveSourceLeafId &&
                  !FULL_WIDTH_ONLY.has(block.primaryLeaf.paneType) && (
                    <button
                      onClick={(e) => {
                        if (availableTypes.length === 1) {
                          splitPane(
                            block.primaryLeaf.id,
                            SplitDirection.Horizontal,
                            availableTypes[0]!,
                          );
                        } else {
                          const rect = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          setSplitMenu((prev) =>
                            prev?.leafId === block.primaryLeaf.id &&
                            prev.dir === SplitDirection.Horizontal
                              ? null
                              : {
                                  leafId: block.primaryLeaf.id,
                                  dir: SplitDirection.Horizontal,
                                  top: rect.bottom + 4,
                                  left: rect.left,
                                },
                          );
                        }
                      }}
                      className="p-1 touch-target rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                      title="Split side-by-side"
                      data-tour={`split-right-${block.primaryLeaf.paneType}`}
                    >
                      <Columns2
                        size={PaneWorkspaceIconMetric.ToolbarSize}
                        strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                      />
                    </button>
                  )}

                {block.node.type === PaneNodeType.Leaf &&
                  availableTypes.length > 0 &&
                  !moveSourceLeafId && (
                    <button
                      onClick={(e) => {
                        if (availableTypes.length === 1) {
                          splitPane(
                            block.primaryLeaf.id,
                            SplitDirection.Vertical,
                            availableTypes[0]!,
                          );
                        } else {
                          const rect = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          setSplitMenu((prev) =>
                            prev?.leafId === block.primaryLeaf.id &&
                            prev.dir === SplitDirection.Vertical
                              ? null
                              : {
                                  leafId: block.primaryLeaf.id,
                                  dir: SplitDirection.Vertical,
                                  top: rect.bottom + 4,
                                  left: rect.left,
                                },
                          );
                        }
                      }}
                      className="p-1 touch-target rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                      title="Add pane below"
                      data-tour={
                        block.primaryLeaf.paneType === PaneTypeId.Globe
                          ? "split-down-btn"
                          : `split-down-${block.primaryLeaf.paneType}`
                      }
                    >
                      <Rows2
                        size={PaneWorkspaceIconMetric.ToolbarSize}
                        strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                      />
                    </button>
                  )}

                {!moveSourceLeafId && (
                  <button
                    onClick={() => toggleMinimize(block.id)}
                    className="p-1 touch-target rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                    title={isMinimized ? "Expand" : "Minimize"}
                  >
                    {isMinimized ? (
                      <ChevronRight
                        size={PaneWorkspaceIconMetric.ToolbarSize}
                        strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                      />
                    ) : (
                      <Minus
                        size={PaneWorkspaceIconMetric.ToolbarSize}
                        strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                      />
                    )}
                  </button>
                )}

                {totalLeafCount > 1 &&
                  block.node.type === PaneNodeType.Leaf &&
                  !moveSourceLeafId && (
                    <button
                      onClick={() => closePane(block.primaryLeaf.id)}
                      className="p-1 touch-target rounded text-sig-dim bg-transparent border-none hover:text-sig-danger hover:bg-sig-danger/10 transition-colors"
                      title="Close pane"
                    >
                      <X
                        size={PaneWorkspaceIconMetric.ToolbarSize}
                        strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                      />
                    </button>
                  )}
              </div>

              {/* Block content (hidden when minimized) */}
              {!isMinimized && (
                <>
                  <div
                    className={`relative overflow-hidden ${useFlexFill ? "flex-1" : ""}`}
                    style={useFlexFill ? undefined : { height: rawH }}
                  >
                    {renderMobileNode(
                      block.node,
                      isVisible,
                      block.node.type === PaneNodeType.Leaf,
                    )}

                    {/* ── Move-mode ghost overlay with 5 drop zones ──── */}
                    {isMoveTarget && (
                      <div className="absolute inset-0 z-20 grid grid-cols-3 grid-rows-3 gap-0.5 p-1">
                        {/* Top zone */}
                        <button
                          onClick={() =>
                            handleMoveAction(block.id, PaneDropZone.Top)
                          }
                          className={cn(
                            PaneMobileClassName.MoveZoneFullWidth,
                            PaneMobileClassName.MoveZone,
                          )}
                        >
                          ↑ ABOVE
                        </button>
                        {/* Show left only when both panes allow it. */}
                        {allowBeside && (
                          <button
                            onClick={() =>
                              handleMoveAction(block.id, PaneDropZone.Left)
                            }
                            className={PaneMobileClassName.MoveZone}
                          >
                            ← LEFT
                          </button>
                        )}
                        {/* Center = swap (spans full width when beside is disallowed) */}
                        <button
                          onClick={() =>
                            handleMoveAction(block.id, PaneDropZone.Center)
                          }
                          className={cn(
                            PaneMobileClassName.SwapZone,
                            !allowBeside &&
                              PaneMobileClassName.MoveZoneFullWidth,
                          )}
                        >
                          ⇄ SWAP
                        </button>
                        {/* Show right only when both panes allow it. */}
                        {allowBeside && (
                          <button
                            onClick={() =>
                              handleMoveAction(block.id, PaneDropZone.Right)
                            }
                            className={PaneMobileClassName.MoveZone}
                          >
                            RIGHT →
                          </button>
                        )}
                        {/* Bottom zone */}
                        <button
                          onClick={() =>
                            handleMoveAction(block.id, PaneDropZone.Bottom)
                          }
                          className={cn(
                            PaneMobileClassName.MoveZoneFullWidth,
                            PaneMobileClassName.MoveZone,
                          )}
                        >
                          ↓ BELOW
                        </button>
                      </div>
                    )}
                  </div>

                  <div
                    className="shrink-0 h-6 bg-sig-border/20 flex items-center justify-center cursor-row-resize touch-none active:bg-sig-accent/30 transition-colors"
                    onPointerDown={(e) => handleHeightDrag(block.id, e)}
                  >
                    <div className="w-10 h-1 rounded-full bg-sig-dim/40" />
                  </div>
                </>
              )}
            </div>
          );
        })}

      {/* Use taller bottom padding when the detail panel is visible.
             Skip when single pane is flex-filling (no scroll, no dead space needed). */}
        {orderedBlocks.length > 1 && <div className="h-16" />}
      </div>
    </div>
  );
}
