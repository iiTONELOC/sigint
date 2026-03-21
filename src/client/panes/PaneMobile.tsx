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
} from "lucide-react";
import type { PaneType, LeafNode, LayoutNode, LayoutState } from "./paneTree";
import { useData } from "@/context/DataContext";
import { ResizeHandle } from "./ResizeHandle";
import type { Globe } from "lucide-react";

// ── Default heights per pane type ────────────────────────────────────

const DEFAULT_HEIGHTS: Record<PaneType, number> = {
  globe: 420,
  "data-table": 320,
  dossier: 360,
  "intel-feed": 340,
  "alert-log": 300,
  "raw-console": 280,
  "video-feed": 400,
  "news-feed": 320,
};

const MIN_PANE_HEIGHT = 160;

// ── Types ────────────────────────────────────────────────────────────

type PaneMobileProps = {
  readonly allLeaves: LeafNode[];
  readonly layout: LayoutState;
  readonly activeMobilePane: number;
  readonly setActiveMobilePane: (idx: number) => void;
  readonly activeCount: number;
  readonly dataSources: { status: string }[];
  readonly counts: Record<string, number>;
  readonly paneMeta: Record<PaneType, { label: string; icon: typeof Globe }>;
  readonly paneComponents: Record<PaneType, React.ComponentType>;
  readonly closePane: (leafId: string) => void;
  readonly minimizePane: (leafId: string, paneType: PaneType) => void;
  readonly changePaneType: (leafId: string, newType: PaneType) => void;
  readonly restorePane: (idx: number) => void;
  readonly splitPane: (
    leafId: string,
    dir: "h" | "v",
    newType: PaneType,
  ) => void;
  readonly resizeSplit: (splitId: string, ratio: number) => void;
  readonly availableTypes: PaneType[];
  readonly leafCount: number;
  readonly swapPanes: (sourceLeafId: string, targetLeafId: string) => void;
  readonly insertPaneBeside: (
    sourceLeafId: string,
    targetLeafId: string,
    zone: "left" | "right" | "top" | "bottom",
  ) => void;
};

// ── Mobile block model ──────────────────────────────────────────────
// Walk the layout tree. V-splits at the top level become separate blocks.
// H-splits stay as one block rendered side-by-side.

type MobileBlock = {
  id: string;
  node: LayoutNode;
  primaryLeaf: LeafNode;
  leafIds: string[];
};

function collectFirstLeaf(node: LayoutNode): LeafNode {
  if (node.type === "leaf") return node;
  return collectFirstLeaf(node.children[0]);
}

function collectLeafIds(node: LayoutNode): string[] {
  if (node.type === "leaf") return [node.id];
  return [
    ...collectLeafIds(node.children[0]),
    ...collectLeafIds(node.children[1]),
  ];
}

function collectMobileBlocks(root: LayoutNode): MobileBlock[] {
  if (root.type === "leaf") {
    return [
      {
        id: root.id,
        node: root,
        primaryLeaf: root,
        leafIds: [root.id],
      },
    ];
  }

  // H-split where BOTH children are leaves → keep as one side-by-side block
  if (
    root.direction === "h" &&
    root.children[0].type === "leaf" &&
    root.children[1].type === "leaf"
  ) {
    return [
      {
        id: root.id,
        node: root,
        primaryLeaf: root.children[0],
        leafIds: [root.children[0].id, root.children[1].id],
      },
    ];
  }

  // Everything else (V-splits, deep H-splits) → flatten into separate blocks
  return [
    ...collectMobileBlocks(root.children[0]),
    ...collectMobileBlocks(root.children[1]),
  ];
}

// ── Component ────────────────────────────────────────────────────────

export function PaneMobile({
  allLeaves,
  layout,
  activeMobilePane,
  setActiveMobilePane,
  activeCount,
  dataSources,
  counts,
  paneMeta,
  paneComponents,
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
}: PaneMobileProps) {
  const { colorMap, chromeHidden, selectedCurrent } = useData();

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
      setOrder((prev) => {
        // Find where the first removed block was — insert new blocks there
        let insertAt = -1;
        if (removed.size > 0) {
          for (let i = 0; i < prev.length; i++) {
            if (removed.has(prev[i]!)) {
              insertAt = i;
              break;
            }
          }
        }

        let next = prev.filter((id) => !removed.has(id));

        if (insertAt >= 0 && added.length > 0) {
          // Insert new blocks where the removed one was
          const clampedIdx = Math.min(insertAt, next.length);
          for (let i = 0; i < added.length; i++) {
            if (!next.includes(added[i]!)) {
              next.splice(clampedIdx + i, 0, added[i]!);
            }
          }
        } else {
          // No removal context — append (first load, restore, etc.)
          for (const id of added) {
            if (!next.includes(id)) next.push(id);
          }
        }

        return next;
      });

      // Auto-scroll to newly added block
      if (added.length > 0) {
        requestAnimationFrame(() => {
          const el = document.getElementById(
            `mobile-block-${added[added.length - 1]}`,
          );
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
    () => order.map((id) => blockMap.get(id)).filter(Boolean) as MobileBlock[],
    [order, blockMap],
  );

  // ── Per-block heights ──────────────────────────────────────────
  const [heights, setHeights] = useState<Record<string, number>>({});

  const getHeight = useCallback(
    (block: MobileBlock) =>
      heights[block.id] ?? DEFAULT_HEIGHTS[block.primaryLeaf.paneType],
    [heights],
  );

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
        DEFAULT_HEIGHTS[block?.primaryLeaf.paneType ?? "globe"];
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        const dy = ev.clientY - startY;
        setHeights((prev) => ({
          ...prev,
          [blockId]: Math.max(MIN_PANE_HEIGHT, startH + dy),
        }));
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [heights, blockMap],
  );

  // ── Move mode — works with leaf IDs directly ───────────────────
  // Tap any grip (block-level or per-leaf inside split) to enter move mode.
  // moveSourceLeafId stores the leaf ID being moved.
  const [moveSourceLeafId, setMoveSourceLeafId] = useState<string | null>(null);

  const handleGripTap = useCallback((leafId: string) => {
    setMoveSourceLeafId((prev) => (prev === leafId ? null : leafId));
  }, []);

  const handleMoveAction = useCallback(
    (
      targetBlockId: string,
      action: "above" | "below" | "left" | "right" | "swap",
    ) => {
      if (!moveSourceLeafId) return;

      const targetBlock = blockMap.get(targetBlockId);
      if (!targetBlock) return;

      const tgtLeafId = targetBlock.primaryLeaf.id;
      if (moveSourceLeafId === tgtLeafId) return;

      if (action === "swap") {
        swapPanes(moveSourceLeafId, tgtLeafId);
      } else {
        const zone =
          action === "above" ? "top" : action === "below" ? "bottom" : action;
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
      // Split the currently active (visible) block, not the last one
      const activeBlock = activeInView
        ? blockMap.get(activeInView)
        : orderedBlocks[orderedBlocks.length - 1];
      const target = activeBlock ?? orderedBlocks[orderedBlocks.length - 1];
      if (target) {
        const leafId = target.primaryLeaf.id;
        splitPane(leafId, "v", type);
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
        (!addDropRef.current || !addDropRef.current.contains(target))
      ) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [addMenuOpen]);

  // ── Split menu ──────────────────────────────────────────────────
  const [splitMenu, setSplitMenu] = useState<{
    leafId: string;
    dir: "h" | "v";
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
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
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
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
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
    tabObsRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.blockId;
            if (id) setActiveInView(id);
          }
        }
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    for (const el of paneRefs.current.values()) {
      tabObsRef.current.observe(el);
    }
    return () => tabObsRef.current?.disconnect();
  }, [orderedBlocks]);

  // ── Count order ─────────────────────────────────────────────────
  const countOrder = [
    "ships",
    "events",
    "quakes",
    "fires",
    "weather",
    "aircraft",
  ] as const;

  // ── Render leaf content ─────────────────────────────────────────
  const renderLeafContent = useCallback(
    (lf: LeafNode, isVisible: boolean) => {
      if (!isVisible) {
        const meta = paneMeta[lf.paneType];
        return (
          <div className="w-full h-full flex items-center justify-center bg-sig-bg/50">
            <span className="text-sig-dim text-(length:--sig-text-sm) tracking-wider">
              {meta.label}
            </span>
          </div>
        );
      }
      const PaneComponent = paneComponents[lf.paneType];
      return <PaneComponent />;
    },
    [paneComponents, paneMeta],
  );

  // ── Render a single leaf with its own mini header ────────────────
  const renderLeafWithHeader = useCallback(
    (lf: LeafNode, isVisible: boolean, siblingLeafId?: string) => {
      const lfMeta = paneMeta[lf.paneType];
      const LfIcon = lfMeta.icon;
      const PaneComponent = paneComponents[lf.paneType];
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
              size={12}
              strokeWidth={2.5}
              className="text-sig-accent shrink-0"
            />
            <span
              className="text-sig-accent tracking-widest text-(length:--sig-text-sm) font-semibold"
              style={{ writingMode: "vertical-lr", textOrientation: "mixed" }}
            >
              {lfMeta.label}
            </span>
            <ChevronRight
              size={10}
              strokeWidth={2.5}
              className="text-sig-dim"
            />
          </button>
        );
      }

      // ── Expanded: normal header + content ──────────────────────
      return (
        <div className="flex flex-col w-full h-full min-w-0 min-h-0 overflow-hidden">
          {/* Per-pane header */}
          <div className="shrink-0 flex items-center flex-wrap gap-0.5 px-1 py-px bg-sig-panel/80 border-b border-sig-border/40 select-none min-w-0">
            {/* Move grip — tap to enter move mode for this leaf */}
            <button
              onClick={() => handleGripTap(lf.id)}
              className={`shrink-0 bg-transparent border-none p-0 px-0.5 py-1 -ml-0.5 transition-colors ${
                moveSourceLeafId === lf.id
                  ? "text-sig-accent"
                  : "text-sig-dim hover:text-sig-accent"
              }`}
              title={
                moveSourceLeafId === lf.id ? "Cancel move" : "Move this pane"
              }
            >
              <GripVertical size={9} strokeWidth={2.5} />
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
              className="flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer group min-w-0"
            >
              <LfIcon
                size={10}
                strokeWidth={2.5}
                className="text-sig-accent shrink-0"
              />
              <span className="text-sig-accent tracking-wider text-(length:--sig-text-sm) font-semibold group-hover:text-sig-bright transition-colors truncate">
                {lfMeta.label}
              </span>
              <ChevronDown
                size={8}
                strokeWidth={2.5}
                className="text-sig-dim shrink-0"
              />
            </button>

            <div className="flex-1 min-w-2" />

            {/* Controls — grouped so they wrap together */}
            <div className="flex items-center gap-0.5 shrink-0">
              {/* Pop out — extract from split into its own block */}
              {siblingLeafId && (
                <button
                  onClick={() =>
                    insertPaneBeside(lf.id, siblingLeafId, "bottom")
                  }
                  className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                  title="Pop out to own block"
                >
                  <Maximize2 size={10} strokeWidth={2.5} />
                </button>
              )}

              {/* Minimize within split */}
              <button
                onClick={() => toggleLeafMinimize(lf.id)}
                className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                title="Minimize"
              >
                <Minus size={10} strokeWidth={2.5} />
              </button>

              {/* Close just this pane */}
              {totalLeafCount > 1 && (
                <button
                  onClick={() => closePane(lf.id)}
                  className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-danger hover:bg-sig-danger/10 transition-colors"
                  title={`Close ${lfMeta.label}`}
                >
                  <X size={10} strokeWidth={2.5} />
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
      paneMeta,
      paneComponents,
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
      if (node.type === "leaf") {
        if (!isTopLevel) {
          return renderLeafWithHeader(node, isVisible);
        }
        return renderLeafContent(node, isVisible);
      }

      const isH = node.direction === "h";

      // Adjust grid when a leaf child is minimized
      let leftSize: string;
      let rightSize: string;

      if (isH) {
        const leftMin =
          node.children[0].type === "leaf" &&
          minimizedLeaves.has(node.children[0].id);
        const rightMin =
          node.children[1].type === "leaf" &&
          minimizedLeaves.has(node.children[1].id);

        if (leftMin && !rightMin) {
          leftSize = "36px";
          rightSize = "1fr";
        } else if (rightMin && !leftMin) {
          leftSize = "1fr";
          rightSize = "36px";
        } else {
          leftSize = `${node.ratio}fr`;
          rightSize = `${1 - node.ratio}fr`;
        }
      } else {
        leftSize = `${node.ratio}fr`;
        rightSize = `${1 - node.ratio}fr`;
      }

      // Get sibling leaf IDs for pop-out button (only for shallow H-splits)
      const leftSiblingId =
        isH && node.children[1].type === "leaf"
          ? node.children[1].id
          : undefined;
      const rightSiblingId =
        isH && node.children[0].type === "leaf"
          ? node.children[0].id
          : undefined;

      return (
        <div
          key={node.id}
          className="w-full h-full min-w-0 min-h-0 overflow-hidden"
          style={{
            display: "grid",
            [isH ? "gridTemplateColumns" : "gridTemplateRows"]:
              `${leftSize} 6px ${rightSize}`,
          }}
        >
          <div className="overflow-hidden min-w-0 min-h-0">
            {node.children[0].type === "leaf" && !isTopLevel
              ? renderLeafWithHeader(node.children[0], isVisible, leftSiblingId)
              : renderMobileNode(node.children[0], isVisible, false)}
          </div>
          <ResizeHandle
            splitId={node.id}
            direction={node.direction}
            onResize={resizeSplit}
          />
          <div className="overflow-hidden min-w-0 min-h-0">
            {node.children[1].type === "leaf" && !isTopLevel
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
      if (block.node.type === "leaf") {
        return paneMeta[block.node.paneType].label;
      }
      const labels = block.leafIds
        .map((id) => {
          const leaf = allLeaves.find((l) => l.id === id);
          return leaf ? paneMeta[leaf.paneType].label : null;
        })
        .filter(Boolean);
      if (labels.length <= 2) return labels.join(" | ");
      return `${labels[0]} +${labels.length - 1}`;
    },
    [paneMeta, allLeaves],
  );

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* ── Portaled menus ───────────────────────────────────────── */}

      {splitMenu &&
        createPortal(
          <div
            ref={splitMenuRef}
            className="fixed z-[80] rounded overflow-hidden bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-48"
            style={{
              top: splitMenu.top,
              left: Math.min(splitMenu.left, window.innerWidth - 200),
            }}
          >
            {availableTypes.map((type) => {
              const meta = paneMeta[type];
              const Icon = meta.icon;
              return (
                <button
                  key={type}
                  onClick={() => {
                    splitPane(splitMenu.leafId, splitMenu.dir, type);
                    setSplitMenu(null);
                  }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 text-sig-text text-(length:--sig-text-md) bg-transparent border-none hover:bg-sig-accent/10 transition-colors min-h-11"
                >
                  <Icon
                    size={14}
                    strokeWidth={2.5}
                    className="text-sig-accent"
                  />
                  {meta.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}

      {typeMenu &&
        createPortal(
          <div
            ref={typeMenuRef}
            className="fixed z-[80] bg-sig-panel border border-sig-border/60 rounded shadow-lg py-0.5 min-w-48"
            style={{
              top: typeMenu.top,
              left: Math.min(typeMenu.left, window.innerWidth - 200),
            }}
          >
            {Object.entries(paneMeta)
              .filter(([id]) => {
                const leaf = allLeaves.find((l) => l.id === typeMenu.leafId);
                return leaf && id !== leaf.paneType;
              })
              .map(([id, m]) => {
                const OptIcon = m.icon;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      changePaneType(typeMenu.leafId, id as PaneType);
                      setTypeMenu(null);
                    }}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 bg-transparent border-none text-left hover:bg-sig-accent/10 transition-colors min-h-11"
                  >
                    <OptIcon
                      size={11}
                      strokeWidth={2}
                      className="text-sig-dim shrink-0"
                    />
                    <span className="text-sig-bright text-(length:--sig-text-md) tracking-wide">
                      {m.label}
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
            {countOrder.map((key) => {
              const count = counts[key] ?? 0;
              return (
                <span
                  key={key}
                  className="text-(length:--sig-text-sm) tabular-nums font-semibold"
                  style={{
                    color: count > 0 ? colorMap[key] : undefined,
                    opacity: count > 0 ? 1 : 0.3,
                  }}
                >
                  {count > 0 ? count.toLocaleString() : "0"}
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Satellite
              size={10}
              strokeWidth={2.5}
              className="text-sig-accent shrink-0"
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
                dataSources.filter(
                  (s) => s.status === "live" || s.status === "cached",
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
            const meta = paneMeta[block.primaryLeaf.paneType];
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
                  isActive
                    ? "text-sig-accent bg-sig-accent/10"
                    : isMinimized
                      ? "text-sig-dim/50 bg-transparent"
                      : "text-sig-dim bg-transparent"
                }`}
              >
                <Icon size={12} strokeWidth={2.5} />
                <span>
                  {block.node.type === "leaf"
                    ? meta.label
                    : getBlockLabel(block)}
                </span>
              </button>
            );
          })}

          {layout.minimized.map((m, i) => {
            const meta = paneMeta[m.paneType];
            const Icon = meta.icon;
            return (
              <button
                key={m.id}
                onClick={() => restorePane(i)}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-sig-panel/80 opacity-50 min-h-8"
                title={`Restore ${meta.label}`}
              >
                <Icon size={12} strokeWidth={2.5} />
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
              <Plus size={14} strokeWidth={2.5} />
            </button>
          )}

          {addMenuOpen &&
            addBtnRef.current &&
            createPortal(
              <div
                ref={addDropRef}
                className="fixed z-[80] rounded bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-48 py-1"
                style={{
                  top: addBtnRef.current.getBoundingClientRect().bottom + 4,
                  left: Math.min(
                    addBtnRef.current.getBoundingClientRect().left,
                    window.innerWidth - 200,
                  ),
                }}
              >
                {availableTypes.map((type) => {
                  const meta = paneMeta[type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => handleAddPane(type)}
                      className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-left text-sig-text text-(length:--sig-text-md) bg-transparent border-none hover:bg-sig-accent/10 transition-colors"
                    >
                      <Icon
                        size={14}
                        strokeWidth={2}
                        className="text-sig-accent"
                      />
                      {meta.label}
                    </button>
                  );
                })}
              </div>,
              document.body,
            )}
        </div>
      )}

      {/* ── Scrollable block column ─────────────────────────────── */}
      <div
        className={`flex-1 overflow-y-auto sigint-scroll ${orderedBlocks.length === 1 ? "flex flex-col" : ""}`}
      >
        {orderedBlocks.map((block) => {
          const meta = paneMeta[block.primaryLeaf.paneType];
          const Icon = meta.icon;
          const rawH =
            heights[block.id] ?? DEFAULT_HEIGHTS[block.primaryLeaf.paneType];
          const useFlexFill = orderedBlocks.length === 1 && !heights[block.id];
          const isVisible = visibleSet.has(block.id);
          const isMinimized = minimizedBlocks.has(block.id);
          const isMoveSource =
            moveSourceLeafId !== null &&
            block.leafIds.includes(moveSourceLeafId);
          const isMoveTarget =
            moveSourceLeafId !== null &&
            !block.leafIds.includes(moveSourceLeafId);

          return (
            <div
              key={block.id}
              id={`mobile-block-${block.id}`}
              data-block-id={block.id}
              data-pane-id={block.primaryLeaf.id}
              ref={(el) => setBlockRef(block.id, el)}
              className={`border-b border-sig-border/40 ${
                useFlexFill ? "flex-1 flex flex-col" : ""
              } ${
                isMoveSource
                  ? "ring-2 ring-sig-accent/70 shadow-[0_0_12px_rgba(0,212,240,0.15)]"
                  : ""
              }`}
            >
              {/* Block header */}
              <div
                className={`flex items-center gap-0.5 px-1 py-px border-b border-sig-border/40 select-none ${
                  isMoveSource ? "bg-sig-accent/10" : "bg-sig-panel/80"
                }`}
              >
                <button
                  onClick={() => handleGripTap(block.primaryLeaf.id)}
                  className={`bg-transparent border-none p-0 px-0.5 py-1 -ml-0.5 transition-colors ${
                    isMoveSource
                      ? "text-sig-accent"
                      : "text-sig-dim hover:text-sig-accent"
                  }`}
                  title={isMoveSource ? "Cancel move" : "Move this block"}
                >
                  <GripVertical size={10} strokeWidth={2.5} />
                </button>

                {block.node.type === "leaf" ? (
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
                    className="flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer group"
                  >
                    <Icon
                      size={11}
                      strokeWidth={2.5}
                      className="text-sig-accent shrink-0"
                    />
                    <span className="text-sig-accent tracking-wider text-(length:--sig-text-sm) font-semibold group-hover:text-sig-bright transition-colors">
                      {meta.label}
                    </span>
                    <ChevronDown
                      size={9}
                      strokeWidth={2.5}
                      className="text-sig-dim group-hover:text-sig-accent transition-colors"
                    />
                  </button>
                ) : (
                  <span className="text-sig-dim tracking-wider text-(length:--sig-text-sm)">
                    SPLIT
                  </span>
                )}

                <div className="flex-1" />

                {block.node.type === "leaf" &&
                  availableTypes.length > 0 &&
                  !moveSourceLeafId && (
                    <button
                      onClick={(e) => {
                        if (availableTypes.length === 1) {
                          splitPane(
                            block.primaryLeaf.id,
                            "h",
                            availableTypes[0]!,
                          );
                        } else {
                          const rect = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          setSplitMenu((prev) =>
                            prev?.leafId === block.primaryLeaf.id &&
                            prev.dir === "h"
                              ? null
                              : {
                                  leafId: block.primaryLeaf.id,
                                  dir: "h",
                                  top: rect.bottom + 4,
                                  left: rect.left,
                                },
                          );
                        }
                      }}
                      className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                      title="Split side-by-side"
                    >
                      <Columns2 size={11} strokeWidth={2.5} />
                    </button>
                  )}

                {block.node.type === "leaf" &&
                  availableTypes.length > 0 &&
                  !moveSourceLeafId && (
                    <button
                      onClick={(e) => {
                        if (availableTypes.length === 1) {
                          splitPane(
                            block.primaryLeaf.id,
                            "v",
                            availableTypes[0]!,
                          );
                        } else {
                          const rect = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          setSplitMenu((prev) =>
                            prev?.leafId === block.primaryLeaf.id &&
                            prev.dir === "v"
                              ? null
                              : {
                                  leafId: block.primaryLeaf.id,
                                  dir: "v",
                                  top: rect.bottom + 4,
                                  left: rect.left,
                                },
                          );
                        }
                      }}
                      className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                      title="Add pane below"
                    >
                      <Rows2 size={11} strokeWidth={2.5} />
                    </button>
                  )}

                {!moveSourceLeafId && (
                  <button
                    onClick={() => toggleMinimize(block.id)}
                    className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                    title={isMinimized ? "Expand" : "Minimize"}
                  >
                    {isMinimized ? (
                      <ChevronRight size={11} strokeWidth={2.5} />
                    ) : (
                      <Minus size={11} strokeWidth={2.5} />
                    )}
                  </button>
                )}

                {totalLeafCount > 1 &&
                  block.node.type === "leaf" &&
                  !moveSourceLeafId && (
                    <button
                      onClick={() => closePane(block.primaryLeaf.id)}
                      className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-danger hover:bg-sig-danger/10 transition-colors"
                      title="Close pane"
                    >
                      <X size={11} strokeWidth={2.5} />
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
                      block.node.type === "leaf",
                    )}

                    {/* ── Move-mode ghost overlay with 5 drop zones ──── */}
                    {isMoveTarget && (
                      <div className="absolute inset-0 z-20 grid grid-cols-3 grid-rows-3 gap-0.5 p-1">
                        {/* Top zone */}
                        <button
                          onClick={() => handleMoveAction(block.id, "above")}
                          className="col-span-3 rounded flex items-center justify-center gap-1 bg-sig-bg/85 border-2 border-dashed border-sig-accent/60 text-sig-accent text-(length:--sig-text-md) tracking-wider font-bold hover:bg-sig-accent/30 active:bg-sig-accent/40 transition-colors"
                        >
                          ↑ ABOVE
                        </button>
                        {/* Left zone */}
                        <button
                          onClick={() => handleMoveAction(block.id, "left")}
                          className="rounded flex items-center justify-center gap-1 bg-sig-bg/85 border-2 border-dashed border-sig-accent/60 text-sig-accent text-(length:--sig-text-md) tracking-wider font-bold hover:bg-sig-accent/30 active:bg-sig-accent/40 transition-colors"
                        >
                          ← LEFT
                        </button>
                        {/* Center = swap */}
                        <button
                          onClick={() => handleMoveAction(block.id, "swap")}
                          className="rounded flex items-center justify-center gap-1 bg-sig-bg/90 border-2 border-sig-accent/80 text-sig-accent text-(length:--sig-text-md) tracking-wider font-bold hover:bg-sig-accent/30 active:bg-sig-accent/40 transition-colors"
                        >
                          ⇄ SWAP
                        </button>
                        {/* Right zone */}
                        <button
                          onClick={() => handleMoveAction(block.id, "right")}
                          className="rounded flex items-center justify-center gap-1 bg-sig-bg/85 border-2 border-dashed border-sig-accent/60 text-sig-accent text-(length:--sig-text-md) tracking-wider font-bold hover:bg-sig-accent/30 active:bg-sig-accent/40 transition-colors"
                        >
                          RIGHT →
                        </button>
                        {/* Bottom zone */}
                        <button
                          onClick={() => handleMoveAction(block.id, "below")}
                          className="col-span-3 rounded flex items-center justify-center gap-1 bg-sig-bg/85 border-2 border-dashed border-sig-accent/60 text-sig-accent text-(length:--sig-text-md) tracking-wider font-bold hover:bg-sig-accent/30 active:bg-sig-accent/40 transition-colors"
                        >
                          ↓ BELOW
                        </button>
                      </div>
                    )}
                  </div>

                  <div
                    className="shrink-0 h-4 bg-sig-border/20 flex items-center justify-center cursor-row-resize touch-none active:bg-sig-accent/30 transition-colors"
                    onPointerDown={(e) => handleHeightDrag(block.id, e)}
                  >
                    <div className="w-10 h-1 rounded-full bg-sig-dim/40" />
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Bottom padding — taller when detail panel is showing so you can scroll past it */}
        <div className={selectedCurrent ? "h-[45vh]" : "h-32"} />
      </div>
    </div>
  );
}
