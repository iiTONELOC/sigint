import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useData } from "@/context/DataContext";
import { LiveTrafficPane } from "@/panes/live-traffic/LiveTrafficPane";
import { DataTablePane } from "@/panes/data-table/DataTablePane";
import { DossierPane } from "@/panes/dossier/DossierPane";
import { IntelFeedPane } from "@/panes/intel-feed/IntelFeedPane";
import { AlertLogPane } from "@/panes/alert-log/AlertLogPane";
import { RawConsolePane } from "@/panes/raw-console/RawConsolePane";
import { VideoFeedPane } from "@/panes/video-feed/VideoFeedPane";
import { PaneHeader } from "@/panes/PaneHeader";
import {
  setDossierOpen,
  onDossierOpenRequest,
} from "@/panes/paneLayoutContext";
import {
  Globe,
  Table2,
  FileSearch,
  Newspaper,
  Bell,
  Terminal,
  Tv,
  Satellite,
  Bookmark,
} from "lucide-react";

import type { PaneType, LayoutNode, LeafNode, LayoutState, LayoutPreset } from "./paneTree";
import {
  leaf, split, collectLeafTypes, leafCount, hasDossierInTree,
  replaceNode, removeLeaf, findParentSplit, updateRatio,
  findNodeById, hasNodeId, collectLeaves,
  defaultLayout, loadLayout, persistLayout, loadPresets, savePresets,
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
  "alert-log": { label: "ALERTS", icon: Bell },
  "raw-console": { label: "CONSOLE", icon: Terminal },
  "video-feed": { label: "VIDEO FEED", icon: Tv },
};

const PANE_COMPONENTS: Record<PaneType, React.ComponentType> = {
  globe: LiveTrafficPane,
  "data-table": DataTablePane,
  dossier: DossierPane,
  "intel-feed": IntelFeedPane,
  "alert-log": AlertLogPane,
  "raw-console": RawConsolePane,
  "video-feed": VideoFeedPane,
};

// ── Component ────────────────────────────────────────────────────────

export function PaneManager() {
  const { chromeHidden, activeCount, dataSources, counts } = useData();
  const [layout, setLayout] = useState<LayoutState>(loadLayout);

  useEffect(() => {
    persistLayout(layout);
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
        const minIdx = prev.minimized.findIndex((m) => m.paneType === "dossier");
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
              return { root: replaceNode(prev.root, entry.siblingId, newSplit), minimized };
            }
          }

          const newRoot = entry.wasSecond
            ? split(entry.dir, prev.root, newLeaf, entry.ratio)
            : split(entry.dir, newLeaf, prev.root, entry.ratio);
          return { root: newRoot, minimized };
        }

        // Not minimized — find globe and split
        const findGlobe = (node: LayoutNode): string | null => {
          if (node.type === "leaf") return node.paneType === "globe" ? node.id : null;
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

  // ── Available pane types ────────────────────────────────────────
  const openTypes = useMemo(() => {
    const s = collectLeafTypes(layout.root);
    for (const m of layout.minimized) s.add(m.paneType);
    return s;
  }, [layout.root, layout.minimized]);

  const availableTypes = useMemo<PaneType[]>(
    () => (Object.keys(PANE_META) as PaneType[]).filter((t) => !openTypes.has(t)),
    [openTypes],
  );

  // ── Actions ─────────────────────────────────────────────────────

  const splitPane = useCallback(
    (leafId: string, dir: "h" | "v", newType: PaneType) => {
      setLayout((prev) => {
        const target = findNodeById(prev.root, leafId);
        if (!target) return prev;
        const ratio = newType === "dossier" || newType === "video-feed" ? 0.75 : 0.5;
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
          return { root: replaceNode(prev.root, entry.siblingId, newSplit), minimized };
        }
      }

      const newRoot = entry.wasSecond
        ? split(entry.dir, prev.root, newLeaf, entry.ratio)
        : split(entry.dir, newLeaf, prev.root, entry.ratio);
      return { root: newRoot, minimized };
    });
  }, []);

  const resizeSplit = useCallback((splitId: string, ratio: number) => {
    setLayout((prev) => ({ ...prev, root: updateRatio(prev.root, splitId, ratio) }));
  }, []);

  const changePaneType = useCallback((leafId: string, newType: PaneType) => {
    setLayout((prev) => ({ ...prev, root: replaceNode(prev.root, leafId, leaf(newType)) }));
  }, []);

  // ── Drag-to-swap ───────────────────────────────────────────────

  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);

  const swapPanes = useCallback((sourceLeafId: string, targetLeafId: string) => {
    if (sourceLeafId === targetLeafId) return;
    setLayout((prev) => {
      const findLeaf = (node: LayoutNode, id: string): LeafNode | null => {
        if (node.type === "leaf") return node.id === id ? node : null;
        return findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id);
      };
      const srcLeaf = findLeaf(prev.root, sourceLeafId);
      const tgtLeaf = findLeaf(prev.root, targetLeafId);
      if (!srcLeaf || !tgtLeaf) return prev;
      const srcType = srcLeaf.paneType;
      const tgtType = tgtLeaf.paneType;
      let newRoot = replaceNode(prev.root, sourceLeafId, { ...srcLeaf, paneType: tgtType });
      newRoot = replaceNode(newRoot, targetLeafId, { ...tgtLeaf, paneType: srcType });
      return { ...prev, root: newRoot };
    });
  }, []);

  const handleDragStart = useCallback((leafId: string) => setDragSourceId(leafId), []);
  const handleDragEnd = useCallback(() => { setDragSourceId(null); setDragTargetId(null); }, []);
  const handleDrop = useCallback(
    (targetLeafId: string) => {
      if (dragSourceId && dragSourceId !== targetLeafId) swapPanes(dragSourceId, targetLeafId);
      setDragSourceId(null);
      setDragTargetId(null);
    },
    [dragSourceId, swapPanes],
  );

  // ── Split menu ─────────────────────────────────────────────────

  const [splitMenu, setSplitMenu] = useState<{ leafId: string; dir: "h" | "v" } | null>(null);
  const splitMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!splitMenu) return;
    const handler = (e: MouseEvent) => {
      if (splitMenu && splitMenuRef.current && !splitMenuRef.current.contains(e.target as Node))
        setSplitMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [splitMenu]);

  // ── Layout presets ─────────────────────────────────────────────

  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState<LayoutPreset[]>(loadPresets);

  const handleSavePreset = useCallback(
    (name: string) => {
      const next = [...presets, { name, state: layout }];
      setPresets(next);
      savePresets(next);
    },
    [presets, layout],
  );
  const handleLoadPreset = useCallback((p: LayoutPreset) => setLayout(p.state), []);
  const handleUpdatePreset = useCallback(
    (idx: number) => {
      const next = presets.map((p, i) => (i === idx ? { ...p, state: layout } : p));
      setPresets(next);
      savePresets(next);
    },
    [presets, layout],
  );
  const handleDeletePreset = useCallback(
    (idx: number) => {
      const next = presets.filter((_, i) => i !== idx);
      setPresets(next);
      savePresets(next);
    },
    [presets],
  );

  // ── Mobile ─────────────────────────────────────────────────────

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [activeMobilePane, setActiveMobilePane] = useState(0);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const allLeaves = useMemo(() => collectLeaves(layout.root), [layout.root]);

  useEffect(() => {
    if (activeMobilePane >= allLeaves.length) {
      setActiveMobilePane(Math.max(0, allLeaves.length - 1));
    }
  }, [allLeaves.length, activeMobilePane]);

  // ── Render helpers ─────────────────────────────────────────────

  const renderSplitMenu = (leafId: string, dir: "h" | "v") => {
    if (!splitMenu || splitMenu.leafId !== leafId || splitMenu.dir !== dir) return null;
    return (
      <div
        ref={splitMenuRef}
        className="absolute right-0 top-full mt-1 z-50 rounded overflow-hidden bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-36"
      >
        {availableTypes.map((type) => {
          const meta = PANE_META[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              onClick={() => { splitPane(leafId, dir, type); setSplitMenu(null); }}
              className="w-full text-left px-3 py-2 flex items-center gap-2 text-sig-text text-(length:--sig-text-md) bg-transparent border-none hover:bg-sig-accent/10 transition-colors"
            >
              <Icon size={14} strokeWidth={2.5} className="text-sig-accent" />
              {meta.label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderNode = (node: LayoutNode): React.ReactNode => {
    if (node.type === "leaf") {
      const meta = PANE_META[node.paneType];
      const PaneComponent = PANE_COMPONENTS[node.paneType];
      const canClose = leafCount(layout.root) > 1;
      const isDragOver = dragSourceId !== null && dragSourceId !== node.id;

      return (
        <div
          key={node.paneType}
          className={`flex flex-col min-w-0 min-h-0 overflow-hidden w-full h-full transition-shadow ${
            dragTargetId === node.id ? "ring-2 ring-sig-accent/50 ring-inset" : ""
          }`}
          onDragOver={isDragOver ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragTargetId(node.id); } : undefined}
          onDragLeave={isDragOver ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragTargetId(null); } : undefined}
          onDrop={isDragOver ? (e) => { e.preventDefault(); handleDrop(node.id); } : undefined}
        >
          <div className="relative">
            <PaneHeader
              label={meta.label}
              icon={meta.icon}
              leafId={node.id}
              statusSlot={
                node.paneType === "globe" ? (
                  <>
                    <Satellite size={10} strokeWidth={2.5} className="text-sig-accent" />
                    <span className="text-sig-accent font-semibold tabular-nums">{activeCount.toLocaleString()}</span>
                    <span className="hidden sm:inline tracking-wider">TRACKS</span>
                    <span className="text-sig-dim hidden sm:inline">
                      · {dataSources.filter((s) => s.status === "live" || s.status === "cached").length}/{dataSources.length} LIVE
                    </span>
                  </>
                ) : undefined
              }
              onSplitH={
                availableTypes.length > 0
                  ? () => {
                      if (availableTypes.length === 1) splitPane(node.id, "h", availableTypes[0]!);
                      else setSplitMenu((prev) => prev?.leafId === node.id && prev.dir === "h" ? null : { leafId: node.id, dir: "h" });
                    }
                  : undefined
              }
              onSplitV={
                availableTypes.length > 0
                  ? () => {
                      if (availableTypes.length === 1) splitPane(node.id, "v", availableTypes[0]!);
                      else setSplitMenu((prev) => prev?.leafId === node.id && prev.dir === "v" ? null : { leafId: node.id, dir: "v" });
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
          [isH ? "gridTemplateColumns" : "gridTemplateRows"]: `${r}fr 6px ${1 - r}fr`,
        }}
      >
        <div className="overflow-hidden min-w-0 min-h-0">{renderNode(node.children[0])}</div>
        <ResizeHandle splitId={node.id} direction={node.direction} onResize={resizeSplit} />
        <div className="overflow-hidden min-w-0 min-h-0">{renderNode(node.children[1])}</div>
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
        restorePane={restorePane}
      />
    );
  }

  // ── DESKTOP ────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Toolbar — minimized panes + layout presets */}
      {(layout.minimized.length > 0 || true) && (
        <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 border-b border-sig-border/50 bg-sig-panel/60">
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
