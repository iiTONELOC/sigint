import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useData } from "@/context/DataContext";
import { useIsMobileLayout } from "@/context/LayoutModeContext";
import { LiveTrafficPane } from "@/panes/live-traffic/LiveTrafficPane";
import { DataTable } from "@/panes/data-table";
import { Dossier } from "@/panes/dossier";
import { IntelFeed } from "@/panes/intel-feed";
import { AlertLog } from "@/panes/alert-log";
import { RawConsole } from "@/panes/raw-console";
import { VideoFeed } from "@/panes/video-feed";
import { NewsFeed } from "@/panes/news-feed";
import { PaneHeader } from "@/panes/PaneHeader";
import {
  setDossierOpen,
  onDossierOpenRequest,
  onWatchLayoutRequest,
  onWalkthroughReset,
  onWalkthroughUndo,
  setWalkthroughLayoutSnapshot,
} from "@/lib/layoutSignals";
import {
  Globe,
  Table2,
  FileSearch,
  Newspaper,
  Rss,
  Bell,
  Terminal,
  Tv,
  Satellite,
  Bookmark,
} from "lucide-react";

import type {
  PaneType,
  LayoutNode,
  LeafNode,
  LayoutState,
  LayoutPreset,
} from "./paneTree";
import {
  leaf,
  split,
  collectLeafTypes,
  leafCount,
  hasDossierInTree,
  replaceNode,
  removeLeaf,
  findParentSplit,
  updateRatio,
  findNodeById,
  hasNodeId,
  collectLeaves,
  defaultLayout,
  loadLayout,
  persistLayout,
  loadPresets,
  savePresets,
} from "./paneTree";
import { LayoutPresetMenu } from "./LayoutPresetMenu";
import { ResizeHandle } from "./ResizeHandle";
import { PaneMobile } from "./PaneMobile";

// ── Pane metadata ────────────────────────────────────────────────────

const PANE_META: Record<PaneType, { label: string; icon: typeof Globe }> = {
  globe: { label: "GLOBE", icon: Globe },
  "data-table": { label: "DATA TABLE", icon: Table2 },
  dossier: { label: "DOSSIER", icon: FileSearch },
  "intel-feed": { label: "INTEL FEED", icon: Newspaper },
  "news-feed": { label: "NEWS FEED", icon: Rss },
  "alert-log": { label: "ALERTS", icon: Bell },
  "raw-console": { label: "CONSOLE", icon: Terminal },
  "video-feed": { label: "VIDEO FEED", icon: Tv },
};

const PANE_COMPONENTS: Record<PaneType, React.ComponentType> = {
  globe: LiveTrafficPane,
  "data-table": DataTable,
  dossier: Dossier,
  "intel-feed": IntelFeed,
  "news-feed": NewsFeed,
  "alert-log": AlertLog,
  "raw-console": RawConsole,
  "video-feed": VideoFeed,
};

// ── Component ────────────────────────────────────────────────────────

export function PaneManager() {
  const { chromeHidden, activeCount, dataSources, counts } = useData();

  // ── Mobile detection (from LayoutModeContext — respects force mode) ──
  const isMobile = useIsMobileLayout();

  const [layout, setLayout] = useState<LayoutState>(defaultLayout);
  const layoutLoaded = useRef(false);
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    let mounted = true;
    loadLayout(isMobile).then((loaded) => {
      if (mounted) {
        setLayout(loaded);
        layoutLoaded.current = true;
      }
    });
    return () => {
      mounted = false;
    };
  }, [isMobile]);

  useEffect(() => {
    if (!layoutLoaded.current) return;
    persistLayout(layout, isMobileRef.current);
  }, [layout]);

  // ── Dossier signal ──────────────────────────────────────────────
  useEffect(() => {
    const open = hasDossierInTree(layout.root);
    setDossierOpen(open);
    return () => setDossierOpen(false);
  }, [layout.root]);

  // ── Listen for dossier open requests from DetailPanel ──────────
  useEffect(() => {
    return onDossierOpenRequest(() => {
      setLayout((prev) => {
        if (hasDossierInTree(prev.root)) return prev;

        // Check minimized
        const minIdx = prev.minimized.findIndex(
          (m) => m.paneType === "dossier",
        );
        if (minIdx >= 0) {
          const entry = prev.minimized[minIdx]!;
          const newLeaf = leaf("dossier");
          const minimized = prev.minimized.filter((_, i) => i !== minIdx);

          if (entry.siblingId && hasNodeId(prev.root, entry.siblingId)) {
            const sibNode = findNodeById(prev.root, entry.siblingId);
            if (sibNode) {
              const newSplit = entry.wasSecond
                ? split(entry.dir, sibNode, newLeaf, entry.ratio)
                : split(entry.dir, newLeaf, sibNode, entry.ratio);
              return {
                root: replaceNode(prev.root, entry.siblingId, newSplit),
                minimized,
              };
            }
          }

          const newRoot = entry.wasSecond
            ? split(entry.dir, prev.root, newLeaf, entry.ratio)
            : split(entry.dir, newLeaf, prev.root, entry.ratio);
          return { root: newRoot, minimized };
        }

        // Not minimized — find globe and split
        const findGlobe = (node: LayoutNode): string | null => {
          if (node.type === "leaf")
            return node.paneType === "globe" ? node.id : null;
          return findGlobe(node.children[0]) ?? findGlobe(node.children[1]);
        };
        const globeId = findGlobe(prev.root);
        if (globeId) {
          const target = findNodeById(prev.root, globeId);
          if (!target) return prev;
          const newSplit = split("h", target, leaf("dossier"), 0.75);
          return { ...prev, root: replaceNode(prev.root, globeId, newSplit) };
        }
        return { ...prev, root: split("h", prev.root, leaf("dossier"), 0.75) };
      });
    });
  }, []);

  // ── Listen for watch layout requests ────────────────────────────
  useEffect(() => {
    return onWatchLayoutRequest(() => {
      setLayout((prev) => {
        const openPanes = collectLeafTypes(prev.root);
        const minTypes = new Set(prev.minimized.map((m) => m.paneType));
        let root = prev.root;
        let minimized = [...prev.minimized];

        // Helper: restore from minimized or create new
        const ensurePane = (
          paneType: PaneType,
          splitDir: "h" | "v",
          anchorType: PaneType,
          ratio: number,
          second: boolean,
        ) => {
          if (openPanes.has(paneType)) return; // already open

          // Check minimized
          const minIdx = minimized.findIndex((m) => m.paneType === paneType);
          let newLeaf: LeafNode;
          if (minIdx >= 0) {
            newLeaf = leaf(paneType);
            minimized = minimized.filter((_, i) => i !== minIdx);
          } else {
            newLeaf = leaf(paneType);
          }

          // Find anchor by scanning current tree for the anchor pane type
          const findByType = (
            node: LayoutNode,
            pt: PaneType,
          ): string | null => {
            if (node.type === "leaf")
              return node.paneType === pt ? node.id : null;
            return (
              findByType(node.children[0], pt) ??
              findByType(node.children[1], pt)
            );
          };

          const anchorId = findByType(root, anchorType);
          if (anchorId) {
            const target = findNodeById(root, anchorId);
            if (target) {
              const newSplit = second
                ? split(splitDir, target, newLeaf, ratio)
                : split(splitDir, newLeaf, target, ratio);
              root = replaceNode(root, anchorId, newSplit);
              openPanes.add(paneType);
              return;
            }
          }
          // Fallback: split on root
          root = second
            ? split(splitDir, root, newLeaf, ratio)
            : split(splitDir, newLeaf, root, ratio);
          openPanes.add(paneType);
        };

        // 1. Dossier — right of globe (75/25)
        ensurePane("dossier", "h", "globe", 0.75, true);

        // 2. Alerts — below globe (65/35)
        ensurePane("alert-log", "v", "globe", 0.65, true);

        // 3. Intel — right of alerts (50/50)
        ensurePane("intel-feed", "h", "alert-log", 0.5, true);

        return { root, minimized };
      });
    });
  }, []);

  // ── Walkthrough: reset to globe-only on tour start ──────────────
  // If user has a non-default layout, save it as a preset first so it's not lost.
  useEffect(() => {
    return onWalkthroughReset(() => {
      const cur = layoutRef.current;
      const count = leafCount(cur.root);
      const hasMinimized = cur.minimized.length > 0;
      const leaves = collectLeaves(cur.root);
      const isDefaultGlobe = count === 1 && !hasMinimized && leaves[0]?.paneType === "globe";

      // Skip if layout is the walkthrough layout (globe + video-feed + alert-log)
      const curTypes = leaves.map((l) => l.paneType).sort().join(",");
      const isWalkthroughLayout = curTypes === "alert-log,globe,video-feed";

      // Check if current layout already matches a saved preset
      const existing = presetsRef.current;
      const matchesPreset = existing.some((p) => {
        const pLeaves = collectLeaves(p.state.root);
        return pLeaves.map((l) => l.paneType).sort().join(",") === curTypes;
      });

      if (!isDefaultGlobe && !isWalkthroughLayout && !matchesPreset) {
        const preTourIdx = existing.findIndex(
          (p) => p.name === "Pre-Tour Layout",
        );
        let next: LayoutPreset[];
        if (preTourIdx >= 0) {
          next = existing.map((p, i) =>
            i === preTourIdx ? { ...p, state: cur } : p,
          );
        } else {
          next = [...existing, { name: "Pre-Tour Layout", state: cur }];
        }
        setPresets(next);
        savePresets(next, isMobileRef.current);
      }

      setLayout({ root: leaf("globe"), minimized: [] });
    });
  }, []);

  // ── Walkthrough: undo wrong pane pick ─────────────────────────
  useEffect(() => {
    return onWalkthroughUndo((paneType: string) => {
      setLayout((prev) => {
        const leaves = collectLeaves(prev.root);
        const target = leaves.find((l) => l.paneType === paneType);
        if (!target) return prev;
        const result = removeLeaf(prev.root, target.id);
        if (!result) return defaultLayout();
        return { root: result, minimized: prev.minimized };
      });
    });
  }, []);

  const openTypes = useMemo(() => {
    const s = collectLeafTypes(layout.root);
    for (const m of layout.minimized) s.add(m.paneType);
    return s;
  }, [layout.root, layout.minimized]);

  const availableTypes = useMemo<PaneType[]>(
    () =>
      (Object.keys(PANE_META) as PaneType[]).filter((t) => !openTypes.has(t)),
    [openTypes],
  );

  // ── Actions ─────────────────────────────────────────────────────

  const splitPane = useCallback(
    (leafId: string, dir: "h" | "v", newType: PaneType) => {
      setLayout((prev) => {
        const target = findNodeById(prev.root, leafId);
        if (!target) return prev;
        const ratio =
          newType === "dossier" || newType === "video-feed" ? 0.75 : 0.5;
        const newSplit = split(dir, target, leaf(newType), ratio);
        return { ...prev, root: replaceNode(prev.root, leafId, newSplit) };
      });
    },
    [],
  );

  const closePane = useCallback((leafId: string) => {
    setLayout((prev) => {
      const result = removeLeaf(prev.root, leafId);
      if (!result) return defaultLayout();
      return { ...prev, root: result };
    });
  }, []);

  const minimizePane = useCallback((leafId: string, paneType: PaneType) => {
    setLayout((prev) => {
      const result = removeLeaf(prev.root, leafId);
      if (!result) return prev;
      const parentInfo = findParentSplit(prev.root, leafId);
      return {
        root: result,
        minimized: [
          ...prev.minimized,
          {
            id: leafId,
            paneType,
            dir: parentInfo?.dir ?? "h",
            ratio: parentInfo?.ratio ?? 0.5,
            wasSecond: parentInfo?.wasSecond ?? true,
            siblingId: parentInfo?.siblingId ?? null,
          },
        ],
      };
    });
  }, []);

  const restorePane = useCallback((idx: number) => {
    setLayout((prev) => {
      const entry = prev.minimized[idx];
      if (!entry) return prev;
      const newLeaf = leaf(entry.paneType);
      const minimized = prev.minimized.filter((_, i) => i !== idx);

      if (entry.siblingId && hasNodeId(prev.root, entry.siblingId)) {
        const sibNode = findNodeById(prev.root, entry.siblingId);
        if (sibNode) {
          const newSplit = entry.wasSecond
            ? split(entry.dir, sibNode, newLeaf, entry.ratio)
            : split(entry.dir, newLeaf, sibNode, entry.ratio);
          return {
            root: replaceNode(prev.root, entry.siblingId, newSplit),
            minimized,
          };
        }
      }

      const newRoot = entry.wasSecond
        ? split(entry.dir, prev.root, newLeaf, entry.ratio)
        : split(entry.dir, newLeaf, prev.root, entry.ratio);
      return { root: newRoot, minimized };
    });
  }, []);

  const resizeSplit = useCallback((splitId: string, ratio: number) => {
    setLayout((prev) => ({
      ...prev,
      root: updateRatio(prev.root, splitId, ratio),
    }));
  }, []);

  const changePaneType = useCallback((leafId: string, newType: PaneType) => {
    setLayout((prev) => ({
      ...prev,
      root: replaceNode(prev.root, leafId, leaf(newType)),
    }));
  }, []);

  // ── Drag-to-move (swap + directional insert) ────────────────────

  type DropZone = "center" | "top" | "bottom" | "left" | "right";

  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);

  /** Determine which zone the cursor is in based on position within the pane */
  const calcDropZone = useCallback(
    (e: React.DragEvent, el: HTMLElement): DropZone => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const EDGE = 0.25; // outer 25% = edge zone
      if (y < EDGE) return "top";
      if (y > 1 - EDGE) return "bottom";
      if (x < EDGE) return "left";
      if (x > 1 - EDGE) return "right";
      return "center";
    },
    [],
  );

  /** Swap two panes in place */
  const swapPanes = useCallback(
    (sourceLeafId: string, targetLeafId: string) => {
      if (sourceLeafId === targetLeafId) return;
      setLayout((prev) => {
        const findLeaf = (node: LayoutNode, id: string): LeafNode | null => {
          if (node.type === "leaf") return node.id === id ? node : null;
          return (
            findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id)
          );
        };
        const src = findLeaf(prev.root, sourceLeafId);
        const tgt = findLeaf(prev.root, targetLeafId);
        if (!src || !tgt) return prev;

        // Swap pane types in the tree
        const srcType = src.paneType;
        const tgtType = tgt.paneType;
        const swapInTree = (node: LayoutNode): LayoutNode => {
          if (node.type === "leaf") {
            if (node.id === sourceLeafId) return { ...node, paneType: tgtType };
            if (node.id === targetLeafId) return { ...node, paneType: srcType };
            return node;
          }
          return {
            ...node,
            children: [
              swapInTree(node.children[0]),
              swapInTree(node.children[1]),
            ],
          };
        };
        return { ...prev, root: swapInTree(prev.root) };
      });
    },
    [],
  );

  /** Move source pane and insert beside target in specified direction */
  const insertPaneBeside = useCallback(
    (sourceLeafId: string, targetLeafId: string, zone: DropZone) => {
      if (sourceLeafId === targetLeafId) return;
      setLayout((prev) => {
        const findLeaf = (node: LayoutNode, id: string): LeafNode | null => {
          if (node.type === "leaf") return node.id === id ? node : null;
          return (
            findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id)
          );
        };
        const srcLeaf = findLeaf(prev.root, sourceLeafId);
        const tgtLeaf = findLeaf(prev.root, targetLeafId);
        if (!srcLeaf || !tgtLeaf) return prev;

        // Remove source from tree (collapses its parent split)
        const withoutSrc = removeLeaf(prev.root, sourceLeafId);
        if (!withoutSrc) return prev;

        const newLeaf = leaf(srcLeaf.paneType);

        // Find target in pruned tree
        const tgtInPruned = findLeaf(withoutSrc, targetLeafId);
        if (!tgtInPruned) return prev;

        // Determine split direction and order
        const dir: "h" | "v" = zone === "left" || zone === "right" ? "h" : "v";
        const sourceFirst = zone === "left" || zone === "top";
        const newSplit = sourceFirst
          ? split(dir, newLeaf, tgtInPruned, 0.5)
          : split(dir, tgtInPruned, newLeaf, 0.5);
        const newRoot = replaceNode(withoutSrc, targetLeafId, newSplit);

        return { ...prev, root: newRoot };
      });
    },
    [],
  );

  const handleDragStart = useCallback(
    (leafId: string) => setDragSourceId(leafId),
    [],
  );
  const handleDragEnd = useCallback(() => {
    setDragSourceId(null);
    setDragTargetId(null);
    setDropZone(null);
  }, []);
  const handleDrop = useCallback(
    (targetLeafId: string) => {
      if (dragSourceId && dragSourceId !== targetLeafId && dropZone) {
        if (dropZone === "center") {
          swapPanes(dragSourceId, targetLeafId);
        } else {
          insertPaneBeside(dragSourceId, targetLeafId, dropZone);
        }
      }
      setDragSourceId(null);
      setDragTargetId(null);
      setDropZone(null);
    },
    [dragSourceId, dropZone, swapPanes, insertPaneBeside],
  );

  // ── Touch drag support (for tablets / touch desktops) ──────────
  // When dragSourceId is set via touch, track finger position to
  // find target pane and drop zone, same as mouse drag.

  useEffect(() => {
    if (!dragSourceId) return;

    const calcZoneFromPoint = (
      cx: number,
      cy: number,
      el: HTMLElement,
    ): DropZone => {
      const rect = el.getBoundingClientRect();
      const x = (cx - rect.left) / rect.width;
      const y = (cy - rect.top) / rect.height;
      const EDGE = 0.25;
      if (y < EDGE) return "top";
      if (y > 1 - EDGE) return "bottom";
      if (x < EDGE) return "left";
      if (x > 1 - EDGE) return "right";
      return "center";
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      // Find the pane element under the finger
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!el) {
        setDragTargetId(null);
        setDropZone(null);
        return;
      }

      // Walk up to find the pane container with data-pane-leaf-id
      const paneEl = el.closest<HTMLElement>("[data-pane-leaf-id]");
      if (!paneEl || paneEl.dataset.paneLeafId === dragSourceId) {
        setDragTargetId(null);
        setDropZone(null);
        return;
      }

      const targetId = paneEl.dataset.paneLeafId!;
      setDragTargetId(targetId);
      setDropZone(calcZoneFromPoint(touch.clientX, touch.clientY, paneEl));
    };

    const onTouchEnd = () => {
      // Complete the drop with current state
      if (dragSourceId && dragTargetId && dropZone) {
        if (dropZone === "center") {
          swapPanes(dragSourceId, dragTargetId);
        } else {
          insertPaneBeside(dragSourceId, dragTargetId, dropZone);
        }
      }
      setDragSourceId(null);
      setDragTargetId(null);
      setDropZone(null);
    };

    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);

    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [dragSourceId, dragTargetId, dropZone, swapPanes, insertPaneBeside]);

  // ── Split menu ─────────────────────────────────────────────────

  const [splitMenu, setSplitMenu] = useState<{
    leafId: string;
    dir: "h" | "v";
    top: number;
    left: number;
  } | null>(null);
  const splitMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!splitMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        splitMenu &&
        splitMenuRef.current &&
        !splitMenuRef.current.contains(e.target as Node)
      )
        setSplitMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [splitMenu]);

  // ── Layout presets ─────────────────────────────────────────────

  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState<LayoutPreset[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const presetsRef = useRef(presets);
  presetsRef.current = presets;

  // ── Walkthrough: push layout snapshot for action step detection ──
  useEffect(() => {
    const types = collectLeafTypes(layout.root);
    const count = leafCount(layout.root);
    setWalkthroughLayoutSnapshot(types, count, presets.length);
  }, [layout.root, presets.length]);

  useEffect(() => {
    loadPresets(isMobile).then((loaded) => {
      setPresets(loaded);
      setPresetsLoaded(true);
    });
  }, []);

  const handleSavePreset = useCallback(
    (name: string) => {
      const next = [...presets, { name, state: layout }];
      setPresets(next);
      savePresets(next, isMobileRef.current);
    },
    [presets, layout],
  );
  const handleLoadPreset = useCallback(
    (p: LayoutPreset) => setLayout(p.state),
    [],
  );
  const handleUpdatePreset = useCallback(
    (idx: number) => {
      const next = presets.map((p, i) =>
        i === idx ? { ...p, state: layout } : p,
      );
      setPresets(next);
      savePresets(next, isMobileRef.current);
    },
    [presets, layout],
  );
  const handleDeletePreset = useCallback(
    (idx: number) => {
      const next = presets.filter((_, i) => i !== idx);
      setPresets(next);
      savePresets(next, isMobileRef.current);
    },
    [presets],
  );

  // ── Mobile ─────────────────────────────────────────────────────

  const [activeMobilePane, setActiveMobilePane] = useState(0);

  const allLeaves = useMemo(() => collectLeaves(layout.root), [layout.root]);

  useEffect(() => {
    if (activeMobilePane >= allLeaves.length) {
      setActiveMobilePane(Math.max(0, allLeaves.length - 1));
    }
  }, [allLeaves.length, activeMobilePane]);

  // ── Render helpers ─────────────────────────────────────────────

  const renderSplitMenu = (leafId: string, dir: "h" | "v") => {
    if (!splitMenu || splitMenu.leafId !== leafId || splitMenu.dir !== dir)
      return null;
    return createPortal(
      <div
        ref={splitMenuRef}
        className="fixed z-[80] rounded bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-36"
        style={{
          top: splitMenu.top,
          left: Math.max(8, Math.min(splitMenu.left, window.innerWidth - 200)),
        }}
      >
        {availableTypes.map((type) => {
          const meta = PANE_META[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              data-tour={`split-menu-${type}`}
              onClick={() => {
                splitPane(leafId, dir, type);
                setSplitMenu(null);
              }}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 text-sig-text text-(length:--sig-text-md) bg-transparent border-none hover:bg-sig-accent/10 transition-colors min-h-11"
            >
              <Icon size={14} strokeWidth={2.5} className="text-sig-accent" />
              {meta.label}
            </button>
          );
        })}
      </div>,
      document.body,
    );
  };

  const renderNode = (node: LayoutNode): React.ReactNode => {
    if (node.type === "leaf") {
      const meta = PANE_META[node.paneType];
      const PaneComponent = PANE_COMPONENTS[node.paneType];
      const canClose = leafCount(layout.root) > 1;
      const isDragOver = dragSourceId !== null && dragSourceId !== node.id;
      const isTarget = dragTargetId === node.id;
      const zone = isTarget ? dropZone : null;

      // Drop zone ghost overlay style
      const ghostStyle: React.CSSProperties | undefined =
        isTarget && zone
          ? {
              position: "absolute",
              zIndex: 20,
              pointerEvents: "none",
              background: "rgba(0, 212, 240, 0.12)",
              border: "2px solid rgba(0, 212, 240, 0.4)",
              borderRadius: 4,
              transition: "all 0.1s ease-out",
              ...(zone === "center"
                ? { inset: 4 }
                : zone === "left"
                  ? { top: 4, bottom: 4, left: 4, width: "calc(50% - 6px)" }
                  : zone === "right"
                    ? { top: 4, bottom: 4, right: 4, width: "calc(50% - 6px)" }
                    : zone === "top"
                      ? { top: 4, left: 4, right: 4, height: "calc(50% - 6px)" }
                      : {
                          bottom: 4,
                          left: 4,
                          right: 4,
                          height: "calc(50% - 6px)",
                        }),
            }
          : undefined;

      // Ghost label
      const ghostLabel =
        isTarget && zone
          ? zone === "center"
            ? "⇄ SWAP"
            : zone === "left"
              ? "← INSERT"
              : zone === "right"
                ? "→ INSERT"
                : zone === "top"
                  ? "↑ INSERT"
                  : "↓ INSERT"
          : null;

      return (
        <div
          key={node.paneType}
          data-pane-leaf-id={node.id}
          data-tour={node.paneType === "globe" ? "globe-pane" : undefined}
          className="flex flex-col min-w-0 min-h-0 overflow-hidden w-full h-full relative"
          onDragOver={
            isDragOver
              ? (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragTargetId(node.id);
                  setDropZone(calcDropZone(e, e.currentTarget as HTMLElement));
                }
              : undefined
          }
          onDragLeave={
            isDragOver
              ? (e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragTargetId(null);
                    setDropZone(null);
                  }
                }
              : undefined
          }
          onDrop={
            isDragOver
              ? (e) => {
                  e.preventDefault();
                  handleDrop(node.id);
                }
              : undefined
          }
        >
          {/* Drop zone ghost overlay */}
          {ghostStyle && (
            <div style={ghostStyle}>
              {ghostLabel && (
                <div
                  className="absolute inset-0 flex items-center justify-center text-sig-accent font-bold tracking-widest text-(length:--sig-text-btn)"
                  style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
                >
                  {ghostLabel}
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <PaneHeader
              label={meta.label}
              icon={meta.icon}
              leafId={node.id}
              paneType={node.paneType}
              statusSlot={
                node.paneType === "globe" ? (
                  <>
                    <Satellite
                      size={10}
                      strokeWidth={2.5}
                      className="text-sig-accent"
                    />
                    <span className="text-sig-accent font-semibold tabular-nums">
                      {activeCount.toLocaleString()}
                    </span>
                    <span className="hidden sm:inline tracking-wider">
                      TRACKS
                    </span>
                    <span className="text-sig-dim hidden sm:inline">
                      ·{" "}
                      {
                        dataSources.filter(
                          (s) => s.status === "live" || s.status === "cached",
                        ).length
                      }
                      /{dataSources.length} LIVE
                    </span>
                  </>
                ) : undefined
              }
              onSplitH={
                availableTypes.length > 0
                  ? (e: React.MouseEvent) => {
                      if (availableTypes.length === 1)
                        splitPane(node.id, "h", availableTypes[0]!);
                      else {
                        const rect = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        setSplitMenu((prev) =>
                          prev?.leafId === node.id && prev.dir === "h"
                            ? null
                            : {
                                leafId: node.id,
                                dir: "h",
                                top: rect.bottom + 4,
                                left: rect.right - 200,
                              },
                        );
                      }
                    }
                  : undefined
              }
              onSplitV={
                availableTypes.length > 0
                  ? (e: React.MouseEvent) => {
                      if (availableTypes.length === 1)
                        splitPane(node.id, "v", availableTypes[0]!);
                      else {
                        const rect = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        setSplitMenu((prev) =>
                          prev?.leafId === node.id && prev.dir === "v"
                            ? null
                            : {
                                leafId: node.id,
                                dir: "v",
                                top: rect.bottom + 4,
                                left: rect.right - 200,
                              },
                        );
                      }
                    }
                  : undefined
              }
              onMinimize={() => minimizePane(node.id, node.paneType)}
              onClose={canClose ? () => closePane(node.id) : undefined}
              onChangePaneType={(id) => changePaneType(node.id, id as PaneType)}
              paneOptions={Object.entries(PANE_META)
                .filter(([id]) => id !== node.paneType)
                .map(([id, m]) => ({ id, label: m.label, icon: m.icon }))}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              onTouchDragStart={handleDragStart}
              isDragTarget={dragSourceId !== null && dragSourceId !== node.id}
            />
            {renderSplitMenu(node.id, "h")}
            {renderSplitMenu(node.id, "v")}
          </div>
          <div className="flex-1 relative overflow-hidden">
            <PaneComponent />
          </div>
        </div>
      );
    }

    // Split node
    const isH = node.direction === "h";
    const r = node.ratio;

    return (
      <div
        key={node.id}
        className="w-full h-full min-w-0 min-h-0 overflow-hidden"
        style={{
          display: "grid",
          [isH ? "gridTemplateColumns" : "gridTemplateRows"]:
            `${r}fr 6px ${1 - r}fr`,
        }}
      >
        <div className="overflow-hidden min-w-0 min-h-0">
          {renderNode(node.children[0])}
        </div>
        <ResizeHandle
          splitId={node.id}
          direction={node.direction}
          onResize={resizeSplit}
        />
        <div className="overflow-hidden min-w-0 min-h-0">
          {renderNode(node.children[1])}
        </div>
      </div>
    );
  };

  // ── MOBILE ─────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <PaneMobile
        allLeaves={allLeaves}
        layout={layout}
        activeMobilePane={activeMobilePane}
        setActiveMobilePane={setActiveMobilePane}
        activeCount={activeCount}
        dataSources={dataSources}
        counts={counts}
        paneMeta={PANE_META}
        paneComponents={PANE_COMPONENTS}
        closePane={closePane}
        minimizePane={minimizePane}
        changePaneType={changePaneType}
        restorePane={restorePane}
        splitPane={splitPane}
        resizeSplit={resizeSplit}
        availableTypes={availableTypes}
        leafCount={leafCount(layout.root)}
        swapPanes={swapPanes}
        insertPaneBeside={insertPaneBeside}
        presets={presets}
        presetsLoaded={presetsLoaded}
        onLoadPreset={handleLoadPreset}
        onSavePreset={handleSavePreset}
        onUpdatePreset={handleUpdatePreset}
        onDeletePreset={handleDeletePreset}
      />
    );
  }

  // ── DESKTOP ────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Toolbar — minimized panes + layout presets */}
      {(layout.minimized.length > 0 || true) && (
        <div
          data-tour="pane-toolbar"
          className="shrink-0 flex items-center gap-1 px-2 py-0.5 border-b border-sig-border/50 bg-sig-panel/60"
        >
          {layout.minimized.map((m, i) => {
            const meta = PANE_META[m.paneType];
            const Icon = meta.icon;
            return (
              <button
                key={m.id}
                onClick={() => restorePane(i)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-sig-panel/80 border border-sig-border/50 hover:text-sig-accent transition-colors shrink-0"
                title={`Restore ${meta.label}`}
              >
                <Icon size={11} strokeWidth={2.5} />
                {meta.label}
              </button>
            );
          })}
          <div className="flex-1" />
          <div className="relative">
            <button
              data-tour="views-btn"
              onClick={() => setShowPresets((v) => !v)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) border border-sig-border/50 hover:text-sig-accent transition-colors"
              title="Layout presets"
            >
              <Bookmark size={11} strokeWidth={2.5} />
              <span className="hidden sm:inline tracking-wider">VIEWS</span>
            </button>
            {showPresets && (
              <LayoutPresetMenu
                presets={presets}
                presetsLoaded={presetsLoaded}
                onLoad={handleLoadPreset}
                onSave={handleSavePreset}
                onUpdate={handleUpdatePreset}
                onDelete={handleDeletePreset}
                onClose={() => setShowPresets(false)}
              />
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-hidden">{renderNode(layout.root)}</div>
    </div>
  );
}
