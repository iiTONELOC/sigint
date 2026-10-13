import { Placement } from "@/layout-mode/model/layoutMode";
import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { Bookmark, ChevronRight, Ellipsis, Plus } from "lucide-react";
import type {
  LeafNode,
  LayoutNode,
  LayoutState,
  LayoutPreset,
} from "./paneTree";
import { useUI } from "@/context/UIContext";
import { onDossierOpenRequest } from "@/lib/runtime/layoutSignals";
import { DomEvent } from "@/runtime";
import { cn } from "@/lib/ui/utils";
import { ButtonType } from "@/lib/ui/button";
import { ResizeHandle } from "./ResizeHandle";
import { LayoutPresetMenu } from "./LayoutPresetMenu";
import { MobileBlockActions } from "./MobileBlockActions";
import { MobilePaneMoveOverlay, PaneHeader } from "./PaneHeader";
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
  PANE_MOBILE_MINIMUM_HEIGHT,
  PaneLayoutRatio,
  PaneMobileRatio,
  PaneMobileScreen,
  PaneNodeType,
  PaneType as PaneTypeId,
  type PaneTypeValue,
  PaneWorkspaceIconMetric,
  SplitDirection,
  type PaneDropZoneValue,
  type PaneEdgeDropZoneValue,
  type SplitDirectionValue,
} from "@/panes/workspace/model/pane";

enum PaneMobileClassName {
  Accent = "text-sig-accent",
  AccentIcon = "text-sig-accent shrink-0",
  ActionButton = "flex items-center justify-center px-2 py-1.5 min-h-8 min-w-8 rounded text-sig-dim hover:text-sig-accent transition-colors shrink-0 touch-target",
  Bar = "shrink-0 z-(--layer-floating) flex items-center flex-wrap gap-x-3 gap-y-1 px-2 py-1 border-b border-sig-border/50 bg-sig-panel/95 backdrop-blur-sm",
  Block = "border-b border-sig-border/40 overflow-clip",
  BlockFlex = "flex-1 min-h-0 flex flex-col",
  BlockMoveSource = "ring-2 ring-sig-accent/70 shadow-[0_0_12px_rgba(0,212,240,0.15)]",
  BodyNoSelect = "select-none",
  CancelMove = "flex items-center px-2 py-1.5 min-h-8 rounded text-sig-danger text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors shrink-0 touch-target",
  CollapsedBlock = "w-full flex items-center gap-2 px-3 py-2 min-h-11 text-left text-sig-dim hover:text-sig-accent transition-colors touch-target",
  CollapsedLabel = "tracking-wider text-(length:--sig-text-sm) font-semibold",
  FillContent = "flex-1 min-h-0",
  Tabs = "flex items-center flex-wrap gap-1 grow min-w-0",
}

const MOBILE_SCREEN_CLASS: Readonly<Record<PaneMobileScreen, string>> = {
  [PaneMobileScreen.Content]: "min-h-[100cqh] flex flex-col",
  [PaneMobileScreen.Full]: "h-[100cqh] flex flex-col",
  [PaneMobileScreen.Half]: "h-[50cqh] flex flex-col",
};

const MOBILE_SCROLL_SETTLE_MS = 100;
const PANE_MOBILE_CANCEL_MOVE_LABEL = "CANCEL MOVE";

enum PaneMobileGridMetric {
  SeparatorPx = 6,
}

enum PaneMobileMenuMetric {
  OffsetPx = 4,
}

type PaneMobileProps = {
  readonly allLeaves: LeafNode[];
  readonly chrome?: ReactNode;
  readonly layout: LayoutState;
  readonly paneCatalog: PaneCatalog;
  readonly closePane: (leafId: string) => void;
  readonly changePaneType: (leafId: string, newType: PaneTypeValue) => void;
  readonly restorePane: (idx: number) => void;
  readonly splitPane: (
    leafId: string,
    dir: SplitDirectionValue,
    newType: PaneTypeValue,
  ) => void;
  readonly resizeSplit: (splitId: string, ratio: number) => void;
  readonly availableTypes: PaneTypeValue[];
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
  chrome,
  layout,
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
  const { chromeHidden } = useUI();
  const bodiesActive = usePaneBodiesActive();
  const [showPresets, setShowPresets] = useState(false);

  const blocks = useMemo(
    () => collectMobileBlocks(layout.root),
    [layout.root],
  );

  const prevBlockIdsRef = useRef(new Set(blocks.map((b) => b.id)));
  const revealAddedRef = useRef(false);
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
  const paneRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [visibilityObserver] = useState(() => new IntersectionObserver(
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
  ));

  const observeBlock = useCallback((el: HTMLDivElement | null) => {
    const id = el?.dataset.blockId;
    if (!el || !id) return undefined;
    paneRefs.current.set(id, el);
    visibilityObserver.observe(el);
    return () => {
      visibilityObserver.unobserve(el);
      paneRefs.current.delete(id);
    };
  }, [visibilityObserver]);

  const handleHeightDrag = useCallback(
    (blockId: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startH =
        heights[blockId] ??
        (e.currentTarget as HTMLElement).previousElementSibling?.getBoundingClientRect().height ??
        PANE_MOBILE_MINIMUM_HEIGHT;
      document.body.classList.add(PaneMobileClassName.BodyNoSelect);

      const onMove = (ev: PointerEvent) => {
        const dy = ev.clientY - startY;
        setHeights((prev) => ({
          ...prev,
          [blockId]: Math.max(
            PANE_MOBILE_MINIMUM_HEIGHT,
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
    [heights],
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

      revealAddedRef.current = true;
      if (zone === Placement.Center) {
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
  const activeBlock = activeInView ? blockMap.get(activeInView) : undefined;
  const [actionsOpen, setActionsOpen] = useState(false);

  const handleSplit = useCallback(
    (leafId: string, direction: SplitDirectionValue, type: PaneTypeValue) => {
      revealAddedRef.current = true;
      splitPane(leafId, direction, type);
    },
    [splitPane],
  );

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addDropRef = useRef<HTMLDivElement>(null);

  const handleAddPane = useCallback(
    (type: PaneTypeValue) => {
      const target = activeBlock ?? blocks.at(-1);
      if (target) handleSplit(target.primaryLeaf.id, SplitDirection.Vertical, type);
      setAddMenuOpen(false);
    },
    [blocks, activeBlock, handleSplit],
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

  const pinnedBlockRef = useRef<string | null>(null);
  const lastScrollAtRef = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const releasePinnedBlock = () => {
      pinnedBlockRef.current = null;
    };
    const markScrolled = () => {
      lastScrollAtRef.current = performance.now();
    };
    const listening = { capture: true, passive: true };
    scroller.addEventListener(DomEvent.PointerDown, releasePinnedBlock, listening);
    scroller.addEventListener(DomEvent.Wheel, releasePinnedBlock, listening);
    scroller.addEventListener(DomEvent.Scroll, markScrolled, listening);
    return () => {
      scroller.removeEventListener(DomEvent.PointerDown, releasePinnedBlock, listening);
      scroller.removeEventListener(DomEvent.Wheel, releasePinnedBlock, listening);
      scroller.removeEventListener(DomEvent.Scroll, markScrolled, listening);
    };
  }, []);

  const scrollToBlock = useCallback((blockId: string) => {
    pinnedBlockRef.current = blockId;
    setActiveInView(blockId);
    const block = document.getElementById(`mobile-block-${blockId}`);
    if (!block) return;
    const scrollWhenSettled = () => {
      if (performance.now() - lastScrollAtRef.current < MOBILE_SCROLL_SETTLE_MS) {
        requestAnimationFrame(scrollWhenSettled);
        return;
      }
      block.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    scrollWhenSettled();
  }, []);

  useEffect(() => {
    const currentIds = new Set(blocks.map((b) => b.id));
    const prevIds = prevBlockIdsRef.current;
    prevBlockIdsRef.current = currentIds;
    const revealAdded = revealAddedRef.current;
    revealAddedRef.current = false;

    let addedId: string | undefined;
    for (const id of currentIds) {
      if (!prevIds.has(id)) addedId = id;
    }
    if (addedId === undefined || !revealAdded) return;
    scrollToBlock(addedId);
  }, [blocks, scrollToBlock]);

  const dossierBlockId = useMemo(() => {
    const dossier = allLeaves.find((lf) => lf.paneType === PaneTypeId.Dossier);
    return dossier ? blocks.find((b) => b.leafIds.includes(dossier.id))?.id : undefined;
  }, [allLeaves, blocks]);

  const revealDossierRef = useRef(false);
  const revealDossier = useCallback(() => {
    const scroller = scrollerRef.current;
    const block = dossierBlockId ? document.getElementById(`mobile-block-${dossierBlockId}`) : null;
    revealDossierRef.current = !block;
    if (!scroller || !block) return;
    const offset = block.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({
      top: scroller.scrollTop + offset - scroller.clientHeight * PaneLayoutRatio.Equal,
      behavior: "smooth",
    });
  }, [dossierBlockId]);

  useEffect(() => onDossierOpenRequest(revealDossier), [revealDossier]);
  useEffect(() => {
    if (revealDossierRef.current) revealDossier();
  }, [revealDossier]);

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
        if (bestId && !pinnedBlockRef.current) setActiveInView(bestId);
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
                      Placement.Bottom,
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
      {!chromeHidden && (
        <div className={PaneMobileClassName.Bar}>
          {chrome}
          {presets && onLoadPreset && (
            <div className="relative shrink-0">
              <button
                type={ButtonType.Button}
                data-tour="views-btn"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setShowPresets((v) => !v);
                }}
                className="flex items-center gap-1 px-2 py-1.5 min-h-8 rounded text-sig-dim text-(length:--sig-text-sm) hover:text-sig-accent transition-colors touch-target"
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
          <div className={PaneMobileClassName.Tabs}>
          {blocks.map((block) => {
            const meta = paneCatalog[block.primaryLeaf.paneType];
            const Icon = meta.icon;
            const isActive = activeInView === block.id;
            const isMinimized = minimizedBlocks.has(block.id);
            return (
              <button
                type={ButtonType.Button}
                key={block.id}
                data-tour={`view-tab-${block.primaryLeaf.paneType}`}
                aria-haspopup={isActive ? "dialog" : undefined}
                aria-expanded={isActive ? actionsOpen : undefined}
                onClick={() => {
                  if (isMinimized) toggleMinimize(block.id);
                  if (isActive && !isMinimized && !moveSourceLeafId) {
                    setActionsOpen(true);
                    return;
                  }
                  scrollToBlock(block.id);
                }}
                className={`flex items-center gap-1 px-2 py-1.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors min-h-8 touch-target ${
                  mobileTabClassName(isActive, isMinimized)
                }`}
              >
                {isActive ? (
                  <Ellipsis
                    size={PaneWorkspaceIconMetric.MediumSize}
                    strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                  />
                ) : (
                  <Icon
                    size={PaneWorkspaceIconMetric.MediumSize}
                    strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                  />
                )}
                <span>{mobileBlockLabel(block, allLeaves, paneCatalog)}</span>
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
                onClick={() => {
                  revealAddedRef.current = true;
                  restorePane(i);
                }}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-sig-panel/80 opacity-50 min-h-8 touch-target"
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

          {moveSourceLeafId ? (
            <button
              type={ButtonType.Button}
              onClick={() => setMoveSourceLeafId(null)}
              className={PaneMobileClassName.CancelMove}
            >
              {PANE_MOBILE_CANCEL_MOVE_LABEL}
            </button>
          ) : (
            availableTypes.length > 0 && (
              <button
                type={ButtonType.Button}
                ref={addBtnRef}
                onClick={() => setAddMenuOpen((o) => !o)}
                data-tour="add-view"
                className={PaneMobileClassName.ActionButton}
                title="Add pane"
              >
                <Plus
                  size={PaneWorkspaceIconMetric.LargeSize}
                  strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                />
              </button>
            )
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

          </div>
        </div>
      )}

      <div
        className={`flex-1 overflow-y-auto sigint-scroll @container-[size] ${blocks.length === 1 ? "flex flex-col" : ""}`}
        ref={scrollerRef}
      >
        {blocks.map((block) => {
          const meta = paneCatalog[block.primaryLeaf.paneType];
          const Icon = meta.icon;
          const screen = dossierBlockId && block.primaryLeaf.paneType === PaneTypeId.Globe
            ? PaneMobileScreen.Half
            : meta.mobileScreen;
          const growsToContent = screen === PaneMobileScreen.Content;
          const resizedHeight = heights[block.id];
          const useFlexFill = blocks.length === 1 && resizedHeight === undefined && !growsToContent;
          const isVisible = growsToContent || visibleSet.has(block.id);
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
              ref={observeBlock}
              className={cn(
                PaneMobileClassName.Block,
                useFlexFill && PaneMobileClassName.BlockFlex,
                !useFlexFill && !isMinimized && resizedHeight === undefined && MOBILE_SCREEN_CLASS[screen],
                isMoveSource && PaneMobileClassName.BlockMoveSource,
              )}
            >
              {isMinimized ? (
                <button
                  type={ButtonType.Button}
                  onClick={() => toggleMinimize(block.id)}
                  aria-expanded={false}
                  className={PaneMobileClassName.CollapsedBlock}
                >
                  <Icon
                    size={PaneWorkspaceIconMetric.MediumSize}
                    strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                  />
                  <span className={PaneMobileClassName.CollapsedLabel}>
                    {mobileBlockLabel(block, allLeaves, paneCatalog)}
                  </span>
                  <ChevronRight
                    size={PaneWorkspaceIconMetric.CompactSize}
                    strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                    className="ml-auto"
                  />
                </button>
              ) : (
                <>
                  <div
                    className={cn("relative overflow-hidden", resizedHeight === undefined && PaneMobileClassName.FillContent)}
                    style={resizedHeight === undefined ? undefined : { height: resizedHeight }}
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

                  {!growsToContent && (
                    <div
                      className="touch-resize relative shrink-0 h-6 bg-sig-border/20 flex items-center justify-center cursor-row-resize touch-none active:bg-sig-accent/30 transition-colors"
                      onPointerDown={(e) => handleHeightDrag(block.id, e)}
                    >
                      <div className="w-10 h-1 rounded-full bg-sig-dim/40" />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {blocks.length > 1 && <div className="h-16" />}
      </div>

      {actionsOpen && activeBlock && (
        <MobileBlockActions
          availableTypes={availableTypes}
          block={activeBlock}
          isMinimized={minimizedBlocks.has(activeBlock.id)}
          label={mobileBlockLabel(activeBlock, allLeaves, paneCatalog)}
          onChangePaneType={changePaneType}
          onClosePane={closePane}
          onDismiss={() => setActionsOpen(false)}
          onMove={handleGripTap}
          onSplit={handleSplit}
          onToggleMinimize={toggleMinimize}
          paneCatalog={paneCatalog}
          totalLeafCount={totalLeafCount}
        />
      )}
    </div>
  );
}
