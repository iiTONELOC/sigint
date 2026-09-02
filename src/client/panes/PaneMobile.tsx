import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Bookmark, ChevronRight, Plus, Satellite } from "lucide-react";
import type {
  PaneType,
  LeafNode,
  LayoutNode,
  LayoutState,
  LayoutPreset,
} from "./paneTree";
import { useUI } from "@/context/UIContext";
import { isSourceDelivering } from "@shared/domain/sourceStatus";
import { Domain } from "@shared/domain/identity";
import type { SourceStatusEntry } from "@/lib/net/sourceHealth";
import { DomEvent } from "@/runtime";
import { cn } from "@/lib/ui/utils";
import { ButtonType } from "@/lib/ui/button";
import { ResizeHandle } from "./ResizeHandle";
import { LayoutPresetMenu } from "./LayoutPresetMenu";
import {
  MobilePaneHeader,
  MobilePaneMoveOverlay,
  PaneHeader,
} from "./PaneHeader";
import { SplitMenu } from "./SplitMenu";
import type { PaneCatalog } from "@/panes/workspace/paneCatalog";
import {
  PaneBody,
  usePaneBodiesActive,
} from "@/panes/workspace/components/paneBody";
import {
  allowsBesideMove,
  collectMobileBlocks,
  horizontalLeafId,
  isMoveSourceBlock,
  isMoveTargetBlock,
  mobileBlockLabel,
  mobileSplitTracks,
  mobileTabClassName,
  moveSourcePaneType,
  type MobileBlock,
} from "@/panes/workspace/utils/mobile";
import {
  PaneDropZone,
  PaneMobileHeight,
  PaneMobileRatio,
  PaneNodeType,
  PaneType as PaneTypeId,
  PaneWorkspaceIconMetric,
  SplitDirection,
  type PaneDropZoneValue,
  type PaneEdgeDropZoneValue,
  type SplitDirectionValue,
} from "@/panes/workspace/model/pane";

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
  BlockMoveSource = "ring-2 ring-sig-accent/70 shadow-[0_0_12px_rgba(0,212,240,0.15)]",
  BodyNoSelect = "select-none",
  StatusCount = "text-(length:--sig-text-sm) tabular-nums font-semibold",
}

enum PaneMobileGridMetric {
  SeparatorPx = 6,
}

enum PaneMobileMenuMetric {
  OffsetPx = 4,
}

type PaneMobileProps = {
  readonly allLeaves: LeafNode[];
  readonly layout: LayoutState;
  readonly activeCount: number;
  readonly dataSources: readonly SourceStatusEntry[];
  readonly counts: Record<string, number>;
  readonly paneCatalog: PaneCatalog;
  readonly closePane: (leafId: string) => void;
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

export function PaneMobile({
  allLeaves,
  layout,
  activeCount,
  dataSources,
  counts,
  paneCatalog,
  closePane,
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
  const { colorMap, chromeHidden } = useUI();
  const bodiesActive = usePaneBodiesActive();
  const [showPresets, setShowPresets] = useState(false);

  const blocks = useMemo(
    () => collectMobileBlocks(layout.root),
    [layout.root],
  );

  const prevBlockIdsRef = useRef(new Set(blocks.map((b) => b.id)));
  useEffect(() => {
    const currentIds = new Set(blocks.map((b) => b.id));
    const prevIds = prevBlockIdsRef.current;
    prevBlockIdsRef.current = currentIds;

    let addedId: string | undefined;
    for (const id of currentIds) {
      if (!prevIds.has(id)) addedId = id;
    }
    if (addedId === undefined) return;
    const blockId = addedId;
    requestAnimationFrame(() => {
      const el = document.getElementById(`mobile-block-${blockId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [blocks]);

  const blockMap = useMemo(() => {
    const m = new Map<string, MobileBlock>();
    for (const b of blocks) m.set(b.id, b);
    return m;
  }, [blocks]);

  const [heights, setHeights] = useState<Record<string, number>>({});

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

  const handleHeightDrag = useCallback(
    (blockId: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const block = blockMap.get(blockId);
      const startH =
        heights[blockId] ??
        paneCatalog[block?.primaryLeaf.paneType ?? PaneTypeId.Globe]
          .mobileHeight;
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
    [heights, blockMap, paneCatalog],
  );

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

  const [activeInView, setActiveInView] = useState<string | null>(
    blocks[0]?.id ?? null,
  );

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addDropRef = useRef<HTMLDivElement>(null);

  const handleAddPane = useCallback(
    (type: PaneType) => {
      const lastBlock = blocks.at(-1);
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
    [blocks, blockMap, activeInView, splitPane],
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

  const [splitMenu, setSplitMenu] = useState<{
    leafId: string;
    dir: SplitDirectionValue;
    top: number;
    left: number;
  } | null>(null);
  const splitMenuRef = useRef<HTMLDivElement>(null);

  const requestSplit = useCallback(
    (
      leafId: string,
      direction: SplitDirectionValue,
      event: React.MouseEvent,
    ) => {
      const onlyType =
        availableTypes.length === 1 ? availableTypes[0] : undefined;
      if (onlyType) {
        splitPane(leafId, direction, onlyType);
        return;
      }
      const rectangle = event.currentTarget.getBoundingClientRect();
      setSplitMenu((current) =>
        current?.leafId === leafId && current.dir === direction
          ? null
          : {
              leafId,
              dir: direction,
              top: rectangle.bottom + PaneMobileMenuMetric.OffsetPx,
              left: rectangle.left,
            },
      );
    },
    [availableTypes, splitPane],
  );

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
  }, [blocks]);

  const renderLeafContent = useCallback(
    (lf: LeafNode, isVisible: boolean) => {
      const meta = paneCatalog[lf.paneType];
      if (!isVisible && !(meta.persistent && bodiesActive)) {
        return (
          <div className="w-full h-full flex items-center justify-center bg-sig-bg/50">
            <span className="text-sig-dim text-(length:--sig-text-sm) tracking-wider">
              {meta.label}
            </span>
          </div>
        );
      }
      return <PaneBody definition={meta} paneType={lf.paneType} />;
    },
    [paneCatalog, bodiesActive],
  );

  const renderLeafWithHeader = useCallback(
    (lf: LeafNode, isVisible: boolean, siblingLeafId?: string) => {
      const lfMeta = paneCatalog[lf.paneType];
      const LfIcon = lfMeta.icon;
      const isLeafMin = minimizedLeaves.has(lf.id);

      if (isLeafMin) {
        return (
          <button
            type={ButtonType.Button}
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

      return (
        <div className="flex flex-col w-full h-full min-w-0 min-h-0 overflow-hidden">
          <PaneHeader
            isFullscreen={false}
            label={lfMeta.label}
            icon={LfIcon}
            leafId={lf.id}
            paneType={lf.paneType}
            onMinimize={() => toggleLeafMinimize(lf.id)}
            onPopOut={
              siblingLeafId
                ? () =>
                    insertPaneBeside(
                      lf.id,
                      siblingLeafId,
                      PaneDropZone.Bottom,
                    )
                : undefined
            }
            onClose={totalLeafCount > 1 ? () => closePane(lf.id) : undefined}
            onChangePaneType={(paneType) => changePaneType(lf.id, paneType)}
            paneCatalog={paneCatalog}
            onGripClick={() => handleGripTap(lf.id)}
          />

          <div className="flex-1 relative overflow-hidden">
            {isVisible || (lfMeta.persistent && bodiesActive) ? (
              <PaneBody definition={lfMeta} paneType={lf.paneType} />
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
      bodiesActive,
      changePaneType,
      closePane,
      totalLeafCount,
      minimizedLeaves,
      toggleLeafMinimize,
      insertPaneBeside,
      handleGripTap,
      moveSourceLeafId,
    ],
  );

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

  const moveSourceType = moveSourcePaneType(allLeaves, moveSourceLeafId);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {splitMenu && (
        <SplitMenu
          ref={splitMenuRef}
          types={availableTypes}
          catalog={paneCatalog}
          top={splitMenu.top}
          left={splitMenu.left}
          wtMenu
          className="fixed z-(--layer-menu) rounded overflow-hidden bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-48"
          onSelect={(type) => {
            splitPane(splitMenu.leafId, splitMenu.dir, type);
            setSplitMenu(null);
          }}
        />
      )}

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

      {!chromeHidden && (
        <div className="shrink-0 sticky top-0 z-(--layer-floating) flex items-center flex-wrap gap-1 px-2 py-1 border-b border-sig-border/50 bg-sig-panel/95 backdrop-blur-sm">
          {blocks.map((block) => {
            const meta = paneCatalog[block.primaryLeaf.paneType];
            const Icon = meta.icon;
            const isActive = activeInView === block.id;
            const isMinimized = minimizedBlocks.has(block.id);
            return (
              <button
                type={ButtonType.Button}
                key={block.id}
                onClick={() => {
                  if (isMinimized) toggleMinimize(block.id);
                  scrollToBlock(block.id);
                }}
                className={`flex items-center gap-1 px-2 py-1.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors min-h-8 ${
                  mobileTabClassName(isActive, isMinimized)
                }`}
              >
                <Icon
                  size={PaneWorkspaceIconMetric.MediumSize}
                  strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                />
                <span>
                  {block.node.type === PaneNodeType.Leaf
                    ? meta.label
                    : mobileBlockLabel(block, allLeaves, paneCatalog)}
                </span>
              </button>
            );
          })}

          {layout.minimized.map((m, i) => {
            const meta = paneCatalog[m.paneType];
            const Icon = meta.icon;
            return (
              <button
                type={ButtonType.Button}
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
              type={ButtonType.Button}
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
            addBtnRef.current && (
              <SplitMenu
                ref={addDropRef}
                types={availableTypes}
                catalog={paneCatalog}
                top={
                  addBtnRef.current.getBoundingClientRect().bottom +
                  PaneMobileMenuMetric.OffsetPx
                }
                left={addBtnRef.current.getBoundingClientRect().left}
                onSelect={handleAddPane}
                className="fixed z-(--layer-menu) rounded bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-48 py-1"
              />
            )}

          {presets && onLoadPreset && (
            <div className="relative ml-auto shrink-0">
              <button
                type={ButtonType.Button}
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

      <div
        className={`flex-1 overflow-y-auto sigint-scroll ${blocks.length === 1 ? "flex flex-col" : ""}`}
      >
        {blocks.map((block) => {
          const meta = paneCatalog[block.primaryLeaf.paneType];
          const rawH = heights[block.id] ?? meta.mobileHeight;
          const useFlexFill = blocks.length === 1 && !heights[block.id];
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
              <MobilePaneHeader
                availableTypes={availableTypes}
                block={block}
                changePaneType={changePaneType}
                closePane={closePane}
                isMinimized={isMinimized}
                moveSourceLeafId={moveSourceLeafId}
                onGripClick={handleGripTap}
                paneCatalog={paneCatalog}
                requestSplit={requestSplit}
                toggleMinimize={toggleMinimize}
                totalLeafCount={totalLeafCount}
              />

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

                    <MobilePaneMoveOverlay
                      active={isMoveTarget}
                      allowBeside={allowBeside}
                      blockId={block.id}
                      onMoveAction={handleMoveAction}
                    />
                  </div>

                  <div
                    className="touch-resize relative shrink-0 h-6 bg-sig-border/20 flex items-center justify-center cursor-row-resize touch-none active:bg-sig-accent/30 transition-colors"
                    onPointerDown={(e) => handleHeightDrag(block.id, e)}
                  >
                    <div className="w-10 h-1 rounded-full bg-sig-dim/40" />
                  </div>
                </>
              )}
            </div>
          );
        })}

        {blocks.length > 1 && <div className="h-16" />}
      </div>
    </div>
  );
}
