import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { cacheGet, cacheSet } from "@/lib/storageService";
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
  X,
  Bookmark,
  Save,
  Trash2,
  Pencil,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type PaneType =
  | "globe"
  | "data-table"
  | "dossier"
  | "intel-feed"
  | "alert-log"
  | "raw-console"
  | "video-feed";

type LeafNode = {
  type: "leaf";
  id: string;
  paneType: PaneType;
};

type SplitNode = {
  type: "split";
  id: string;
  direction: "h" | "v";
  ratio: number; // 0–1, first child gets ratio
  children: [LayoutNode, LayoutNode];
};

type LayoutNode = LeafNode | SplitNode;

type LayoutState = {
  root: LayoutNode;
  minimized: {
    id: string;
    paneType: PaneType;
    /** Restore hints — direction and ratio of the split this pane was in */
    dir: "h" | "v";
    ratio: number;
    /** Was this the second child? If so, restore on the right/bottom side */
    wasSecond: boolean;
    /** The sibling node's ID — used to find the insertion point in the tree */
    siblingId: string | null;
  }[];
};

const CACHE_KEY = "sigint.layout.v2";

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

// ── Tree helpers ─────────────────────────────────────────────────────

let _idC = 0;
function uid(): string {
  _idC += 1;
  return `n${Date.now()}-${_idC}`;
}

function leaf(paneType: PaneType): LeafNode {
  return { type: "leaf", id: uid(), paneType };
}

function split(
  dir: "h" | "v",
  a: LayoutNode,
  b: LayoutNode,
  ratio = 0.5,
): SplitNode {
  return { type: "split", id: uid(), direction: dir, ratio, children: [a, b] };
}

/** Collect all leaf pane types in the tree */
function collectLeafTypes(node: LayoutNode): Set<PaneType> {
  if (node.type === "leaf") return new Set([node.paneType]);
  const s = collectLeafTypes(node.children[0]);
  for (const t of collectLeafTypes(node.children[1])) s.add(t);
  return s;
}

/** Count leaves */
function leafCount(node: LayoutNode): number {
  if (node.type === "leaf") return 1;
  return leafCount(node.children[0]) + leafCount(node.children[1]);
}

/** Check if dossier is in tree */
function hasDossierInTree(node: LayoutNode): boolean {
  if (node.type === "leaf") return node.paneType === "dossier";
  return (
    hasDossierInTree(node.children[0]) || hasDossierInTree(node.children[1])
  );
}

/** Replace a node by id, return new tree (immutable) */
function replaceNode(
  root: LayoutNode,
  targetId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (root.id === targetId) return replacement;
  if (root.type === "leaf") return root;
  return {
    ...root,
    children: [
      replaceNode(root.children[0], targetId, replacement),
      replaceNode(root.children[1], targetId, replacement),
    ],
  };
}

/** Remove a leaf by id — promotes sibling. Returns null if removing would empty tree. */
function removeLeaf(root: LayoutNode, targetId: string): LayoutNode | null {
  if (root.type === "leaf") {
    return root.id === targetId ? null : root;
  }
  const [a, b] = root.children;
  if (a.id === targetId) return b;
  if (b.id === targetId) return a;
  // Recurse
  const newA = removeLeaf(a, targetId);
  if (newA !== a) return newA === null ? b : { ...root, children: [newA, b] };
  const newB = removeLeaf(b, targetId);
  if (newB !== b) return newB === null ? a : { ...root, children: [a, newB] };
  return root;
}

/** Find the parent split of a leaf — returns restore hints or null if leaf is root */
function findParentSplit(
  root: LayoutNode,
  leafId: string,
): {
  dir: "h" | "v";
  ratio: number;
  wasSecond: boolean;
  siblingId: string;
} | null {
  if (root.type === "leaf") return null;
  const [a, b] = root.children;
  if (a.type === "leaf" && a.id === leafId)
    return {
      dir: root.direction,
      ratio: root.ratio,
      wasSecond: false,
      siblingId: b.id,
    };
  if (b.type === "leaf" && b.id === leafId)
    return {
      dir: root.direction,
      ratio: root.ratio,
      wasSecond: true,
      siblingId: a.id,
    };
  return findParentSplit(a, leafId) ?? findParentSplit(b, leafId);
}

/** Update ratio for a split by id */
function updateRatio(
  root: LayoutNode,
  splitId: string,
  ratio: number,
): LayoutNode {
  if (root.type === "leaf") return root;
  if (root.id === splitId) return { ...root, ratio };
  return {
    ...root,
    children: [
      updateRatio(root.children[0], splitId, ratio),
      updateRatio(root.children[1], splitId, ratio),
    ],
  };
}

// ── Persistence ──────────────────────────────────────────────────────

function defaultLayout(): LayoutState {
  return { root: leaf("globe"), minimized: [] };
}

function isValidTree(node: unknown): node is LayoutNode {
  if (!node || typeof node !== "object") return false;
  const n = node as any;
  if (n.type === "leaf")
    return typeof n.id === "string" && typeof n.paneType === "string";
  if (n.type === "split") {
    return (
      typeof n.id === "string" &&
      (n.direction === "h" || n.direction === "v") &&
      typeof n.ratio === "number" &&
      Array.isArray(n.children) &&
      n.children.length === 2 &&
      isValidTree(n.children[0]) &&
      isValidTree(n.children[1])
    );
  }
  return false;
}

function loadLayout(): LayoutState {
  try {
    const cached = cacheGet<LayoutState>(CACHE_KEY);
    if (cached && isValidTree(cached.root)) {
      // Backfill minimized entries from older cache versions missing restore hints
      const minimized = (cached.minimized ?? []).map((m: any) => ({
        id: m.id,
        paneType: m.paneType,
        dir: m.dir ?? "h",
        ratio: m.ratio ?? 0.5,
        wasSecond: m.wasSecond ?? true,
        siblingId: m.siblingId ?? null,
      }));
      return { root: cached.root, minimized };
    }
  } catch {
    /* ignore */
  }
  return defaultLayout();
}

function persistLayout(layout: LayoutState) {
  cacheSet(CACHE_KEY, layout);
}

// ── Layout Presets ───────────────────────────────────────────────────

const PRESETS_KEY = "sigint.layout.presets.v1";

type LayoutPreset = { name: string; state: LayoutState };

function loadPresets(): LayoutPreset[] {
  return cacheGet<LayoutPreset[]>(PRESETS_KEY) ?? [];
}

function savePresets(presets: LayoutPreset[]) {
  cacheSet(PRESETS_KEY, presets);
}

function LayoutPresetMenu({
  presets,
  onLoad,
  onSave,
  onUpdate,
  onDelete,
  onClose,
}: {
  presets: LayoutPreset[];
  onLoad: (p: LayoutPreset) => void;
  onSave: (name: string) => void;
  onUpdate: (idx: number) => void;
  onDelete: (idx: number) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const paneCount = (p: LayoutPreset) => {
    const count = leafCount(p.state.root);
    const min = p.state.minimized.length;
    return min > 0 ? `${count}+${min}` : `${count}`;
  };

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full z-50 mt-0.5 bg-sig-panel border border-sig-border/60 rounded shadow-lg py-1 min-w-52"
    >
      <div className="px-2 py-1 text-sig-dim text-[10px] tracking-wider font-semibold border-b border-sig-border/30">
        LAYOUT PRESETS
      </div>
      {presets.length === 0 && (
        <div className="px-2 py-2 text-sig-dim text-(length:--sig-text-sm)">
          No saved presets
        </div>
      )}
      {presets.map((p, i) => (
        <div
          key={i}
          className="flex items-center gap-1 px-2 py-1 hover:bg-sig-accent/10 transition-colors"
        >
          <button
            onClick={() => {
              onLoad(p);
              onClose();
            }}
            className="flex-1 text-left text-sig-bright text-(length:--sig-text-md) bg-transparent border-none truncate"
          >
            {p.name}
            <span className="text-sig-dim ml-1">({paneCount(p)} panes)</span>
          </button>
          <button
            title="Update with current layout"
            onClick={() => onUpdate(i)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors p-0.5 shrink-0"
          >
            <Pencil size={10} />
          </button>
          <button
            title="Delete preset"
            onClick={() => onDelete(i)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-danger transition-colors p-0.5 shrink-0"
          >
            <Trash2 size={10} />
          </button>
        </div>
      ))}
      <div className="border-t border-sig-border/30 mt-1 pt-1 px-2 flex items-center gap-1">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Preset name..."
          className="flex-1 bg-transparent outline-none text-sig-bright text-(length:--sig-text-md) min-w-0 caret-sig-accent"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              onSave(newName.trim());
              setNewName("");
              onClose();
            }
          }}
        />
        <button
          onClick={() => {
            if (newName.trim()) {
              onSave(newName.trim());
              setNewName("");
              onClose();
            }
          }}
          className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors p-0.5 shrink-0"
          title="Save current layout as preset"
        >
          <Save size={11} />
        </button>
      </div>
    </div>
  );
}

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
        // Only add dossier if it's not already in the tree
        if (hasDossierInTree(prev.root)) return prev;

        // Check if dossier is minimized — restore it instead of creating new
        const minIdx = prev.minimized.findIndex(
          (m) => m.paneType === "dossier",
        );
        if (minIdx >= 0) {
          const entry = prev.minimized[minIdx]!;
          const newLeaf = leaf("dossier");
          const minimized = prev.minimized.filter((_, i) => i !== minIdx);

          // Try to restore at original position
          if (entry.siblingId) {
            const findNode = (node: LayoutNode, id: string): boolean => {
              if (node.id === id) return true;
              if (node.type === "split")
                return (
                  findNode(node.children[0], id) ||
                  findNode(node.children[1], id)
                );
              return false;
            };
            if (findNode(prev.root, entry.siblingId)) {
              const sibNode = (function find(
                node: LayoutNode,
              ): LayoutNode | null {
                if (node.id === entry.siblingId) return node;
                if (node.type === "split")
                  return find(node.children[0]) ?? find(node.children[1]);
                return null;
              })(prev.root);
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
          }

          // Fallback — restore at root
          const newRoot = entry.wasSecond
            ? split(entry.dir, prev.root, newLeaf, entry.ratio)
            : split(entry.dir, newLeaf, prev.root, entry.ratio);
          return { root: newRoot, minimized };
        }

        // Not minimized — create fresh dossier split
        // Find the globe leaf and split it with a dossier
        const findGlobe = (node: LayoutNode): string | null => {
          if (node.type === "leaf")
            return node.paneType === "globe" ? node.id : null;
          return findGlobe(node.children[0]) ?? findGlobe(node.children[1]);
        };
        const globeId = findGlobe(prev.root);
        if (globeId) {
          const newLeaf = leaf("dossier");
          const target = (function find(node: LayoutNode): LayoutNode | null {
            if (node.type === "leaf" && node.id === globeId) return node;
            if (node.type === "split")
              return find(node.children[0]) ?? find(node.children[1]);
            return null;
          })(prev.root);
          if (!target) return prev;
          const newSplit = split("h", target, newLeaf, 0.75);
          return { ...prev, root: replaceNode(prev.root, globeId, newSplit) };
        }
        // No globe — just split the root
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
    () =>
      (Object.keys(PANE_META) as PaneType[]).filter((t) => !openTypes.has(t)),
    [openTypes],
  );

  // ── Actions ─────────────────────────────────────────────────────

  const splitPane = useCallback(
    (leafId: string, dir: "h" | "v", newType: PaneType) => {
      setLayout((prev) => {
        const newLeaf = leaf(newType);
        const find = (node: LayoutNode): LayoutNode | null => {
          if (node.type === "leaf" && node.id === leafId) return node;
          if (node.type === "split") {
            return find(node.children[0]) ?? find(node.children[1]);
          }
          return null;
        };
        const target = find(prev.root);
        if (!target) return prev;
        // Dossier and secondary panes open smaller — existing pane keeps 75%
        const ratio =
          newType === "dossier" || newType === "video-feed" ? 0.75 : 0.5;
        const newSplit = split(dir, target, newLeaf, ratio);
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
      if (!result) return prev; // don't minimize the last pane
      // Capture the parent split's geometry so we can restore at the same size and position
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

      // Try to find the old sibling in the current tree and re-split there
      if (entry.siblingId) {
        const findNode = (node: LayoutNode, id: string): boolean => {
          if (node.id === id) return true;
          if (node.type === "split")
            return (
              findNode(node.children[0], id) || findNode(node.children[1], id)
            );
          return false;
        };
        if (findNode(prev.root, entry.siblingId)) {
          // Found the sibling — wrap it in a new split with the restored pane
          const sibNode = (function find(node: LayoutNode): LayoutNode | null {
            if (node.id === entry.siblingId) return node;
            if (node.type === "split")
              return find(node.children[0]) ?? find(node.children[1]);
            return null;
          })(prev.root);
          if (sibNode) {
            // ratio = first child's share in the original split
            // wasSecond=true: restored pane was child[1], sibling was child[0] → sibling first, ratio unchanged
            // wasSecond=false: restored pane was child[0], sibling was child[1] → restored pane first, ratio unchanged
            const newSplit = entry.wasSecond
              ? split(entry.dir, sibNode, newLeaf, entry.ratio)
              : split(entry.dir, newLeaf, sibNode, entry.ratio);
            const newRoot = replaceNode(prev.root, entry.siblingId, newSplit);
            return { root: newRoot, minimized };
          }
        }
      }

      // Fallback — sibling gone or not found, split at root
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

  // ── Drag-to-swap panes ──────────────────────────────────────────

  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);

  const swapPanes = useCallback(
    (sourceLeafId: string, targetLeafId: string) => {
      if (sourceLeafId === targetLeafId) return;
      setLayout((prev) => {
        // Find both leaves
        const findLeaf = (node: LayoutNode, id: string): LeafNode | null => {
          if (node.type === "leaf") return node.id === id ? node : null;
          return (
            findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id)
          );
        };
        const srcLeaf = findLeaf(prev.root, sourceLeafId);
        const tgtLeaf = findLeaf(prev.root, targetLeafId);
        if (!srcLeaf || !tgtLeaf) return prev;

        // Swap paneTypes — keep the tree structure, just swap what's rendered where
        const srcType = srcLeaf.paneType;
        const tgtType = tgtLeaf.paneType;
        let newRoot = replaceNode(prev.root, sourceLeafId, {
          ...srcLeaf,
          paneType: tgtType,
        });
        newRoot = replaceNode(newRoot, targetLeafId, {
          ...tgtLeaf,
          paneType: srcType,
        });
        return { ...prev, root: newRoot };
      });
    },
    [],
  );

  const handleDragStart = useCallback((leafId: string) => {
    setDragSourceId(leafId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragSourceId(null);
    setDragTargetId(null);
  }, []);

  const handleDrop = useCallback(
    (targetLeafId: string) => {
      if (dragSourceId && dragSourceId !== targetLeafId) {
        swapPanes(dragSourceId, targetLeafId);
      }
      setDragSourceId(null);
      setDragTargetId(null);
    },
    [dragSourceId, swapPanes],
  );

  // ── Add menu (split menus only) ──────────────────────────────────

  const [splitMenu, setSplitMenu] = useState<{
    leafId: string;
    dir: "h" | "v";
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

  // ── Layout presets ──────────────────────────────────────────────

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

  const handleLoadPreset = useCallback((p: LayoutPreset) => {
    setLayout(p.state);
  }, []);

  const handleUpdatePreset = useCallback(
    (idx: number) => {
      const next = presets.map((p, i) =>
        i === idx ? { ...p, state: layout } : p,
      );
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

  // ── Mobile ──────────────────────────────────────────────────────

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [activeMobilePane, setActiveMobilePane] = useState(0);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const allLeaves = useMemo(() => {
    const leaves: LeafNode[] = [];
    const walk = (n: LayoutNode) => {
      if (n.type === "leaf") leaves.push(n);
      else {
        walk(n.children[0]);
        walk(n.children[1]);
      }
    };
    walk(layout.root);
    return leaves;
  }, [layout.root]);

  useEffect(() => {
    if (activeMobilePane >= allLeaves.length) {
      setActiveMobilePane(Math.max(0, allLeaves.length - 1));
    }
  }, [allLeaves.length, activeMobilePane]);

  // ── Render helpers ──────────────────────────────────────────────

  const multiPane = leafCount(layout.root) > 1 || layout.minimized.length > 0;

  const renderSplitMenu = (leafId: string, dir: "h" | "v") => {
    if (!splitMenu || splitMenu.leafId !== leafId || splitMenu.dir !== dir)
      return null;
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
              onClick={() => {
                splitPane(leafId, dir, type);
                setSplitMenu(null);
              }}
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
      const showHeader = true; // Pane headers always visible — chromeHidden only affects app-level chrome
      const canClose = leafCount(layout.root) > 1;

      const isDragOver = dragSourceId !== null && dragSourceId !== node.id;

      return (
        <div
          key={node.paneType}
          className={`flex flex-col min-w-0 min-h-0 overflow-hidden w-full h-full transition-shadow ${
            dragTargetId === node.id
              ? "ring-2 ring-sig-accent/50 ring-inset"
              : ""
          }`}
          onDragOver={
            isDragOver
              ? (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragTargetId(node.id);
                }
              : undefined
          }
          onDragLeave={
            isDragOver
              ? (e) => {
                  // Only clear if actually leaving this container
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragTargetId(null);
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
          {showHeader && (
            <div className="relative">
              <PaneHeader
                label={meta.label}
                icon={meta.icon}
                leafId={node.id}
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
                    ? () => {
                        if (availableTypes.length === 1) {
                          splitPane(node.id, "h", availableTypes[0]!);
                        } else {
                          setSplitMenu((prev) =>
                            prev?.leafId === node.id && prev.dir === "h"
                              ? null
                              : { leafId: node.id, dir: "h" },
                          );
                        }
                      }
                    : undefined
                }
                onSplitV={
                  availableTypes.length > 0
                    ? () => {
                        if (availableTypes.length === 1) {
                          splitPane(node.id, "v", availableTypes[0]!);
                        } else {
                          setSplitMenu((prev) =>
                            prev?.leafId === node.id && prev.dir === "v"
                              ? null
                              : { leafId: node.id, dir: "v" },
                          );
                        }
                      }
                    : undefined
                }
                onMinimize={() => minimizePane(node.id, node.paneType)}
                onClose={canClose ? () => closePane(node.id) : undefined}
                onChangePaneType={(id) =>
                  changePaneType(node.id, id as PaneType)
                }
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
          )}
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

  // ── MOBILE ──────────────────────────────────────────────────────

  if (isMobile) {
    const canCloseMobile = allLeaves.length > 1;

    return (
      <div className="w-full h-full flex flex-col overflow-hidden">
        {/* Mobile status bar — track count + source status */}
        <div className="shrink-0 flex items-center gap-2 px-2 py-0.5 border-b border-sig-border/30 bg-sig-panel/60">
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
          <div className="flex-1" />
          {/* Per-layer counts */}
          {Object.entries(counts).map(([key, count]) => (
            <span
              key={key}
              className="text-sig-dim text-(length:--sig-text-xs) tabular-nums"
            >
              {count > 0 ? count : null}
            </span>
          ))}
        </div>

        {/* Mobile tab bar — always visible, scroll-snap, larger touch targets */}
        <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-sig-border/50 bg-sig-panel/80 overflow-x-auto sigint-scroll snap-x snap-mandatory">
          {allLeaves.map((lf, i) => {
            const meta = PANE_META[lf.paneType];
            const Icon = meta.icon;
            const active = i === activeMobilePane;
            return (
              <div
                key={lf.id}
                className="relative flex items-center shrink-0 snap-start"
              >
                <button
                  onClick={() => setActiveMobilePane(i)}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-l text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors min-h-8 ${
                    active
                      ? "text-sig-accent bg-sig-accent/10"
                      : "text-sig-dim bg-transparent"
                  } ${canCloseMobile && active ? "pr-1" : "rounded-r"}`}
                >
                  <Icon size={12} strokeWidth={2.5} />
                  {meta.label}
                </button>
                {/* Close button — only on active tab, only when multiple panes open */}
                {canCloseMobile && active && (
                  <button
                    onClick={() => {
                      closePane(lf.id);
                      if (activeMobilePane >= allLeaves.length - 1) {
                        setActiveMobilePane(Math.max(0, allLeaves.length - 2));
                      }
                    }}
                    className="px-1 py-1.5 rounded-r text-sig-dim min-h-8 bg-sig-accent/10 transition-colors"
                    title={`Close ${meta.label}`}
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                )}
                {/* Active bottom indicator */}
                {active && (
                  <span className="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full bg-sig-accent" />
                )}
              </div>
            );
          })}
          {layout.minimized.map((m, i) => {
            const meta = PANE_META[m.paneType];
            const Icon = meta.icon;
            return (
              <button
                key={m.id}
                onClick={() => restorePane(i)}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-sig-panel/80 shrink-0 opacity-50 min-h-8 snap-start"
                title={`Restore ${meta.label}`}
              >
                <Icon size={12} strokeWidth={2.5} />
                {meta.label}
              </button>
            );
          })}
          <div className="flex-1" />
        </div>
        <div className="flex-1 relative overflow-hidden">
          {allLeaves[activeMobilePane] &&
            (() => {
              const lf = allLeaves[activeMobilePane]!;
              const PaneComponent = PANE_COMPONENTS[lf.paneType];
              return <PaneComponent />;
            })()}
        </div>
      </div>
    );
  }

  // ── DESKTOP ─────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Toolbar — minimized panes + layout presets */}
      {(layout.minimized.length > 0 || true) && (
        <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 border-b border-sig-border/50 bg-sig-panel/60">
          {/* Minimized tabs */}
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

          {/* Layout presets */}
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

      {/* Tree layout */}
      <div className="flex-1 overflow-hidden">{renderNode(layout.root)}</div>
    </div>
  );
}

// ── Resize Handle ────────────────────────────────────────────────────

function ResizeHandle({
  splitId,
  direction,
  onResize,
}: {
  readonly splitId: string;
  readonly direction: "h" | "v";
  readonly onResize: (splitId: string, ratio: number) => void;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const handle = handleRef.current;
      if (!handle) return;
      const parent = handle.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const isH = direction === "h";
      const totalSize = isH ? rect.width : rect.height;
      const startOffset = isH ? rect.left : rect.top;

      setDragging(true);
      document.body.style.cursor = isH ? "col-resize" : "row-resize";
      // Prevent text selection during drag
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        const pos = isH ? ev.clientX : ev.clientY;
        const raw = (pos - startOffset) / totalSize;
        const ratio = Math.max(0.1, Math.min(0.9, raw));
        // Live resize — update ratio every frame
        onResize(splitId, ratio);
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setDragging(false);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [splitId, direction, onResize],
  );

  const isH = direction === "h";

  return (
    <div
      ref={handleRef}
      className={`relative flex items-center justify-center ${
        isH ? "cursor-col-resize w-[6px]" : "cursor-row-resize h-[6px]"
      } ${
        dragging
          ? "bg-sig-accent/40"
          : "bg-sig-border/30 hover:bg-sig-accent/25"
      } transition-colors`}
      onPointerDown={onPointerDown}
    >
      {/* Grip dots */}
      <div
        className={`flex ${isH ? "flex-col" : "flex-row"} gap-[3px] pointer-events-none`}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`rounded-full ${
              dragging ? "bg-sig-accent/80" : "bg-sig-dim/40"
            } ${isH ? "w-[2px] h-[2px]" : "w-[2px] h-[2px]"}`}
          />
        ))}
      </div>
      {/* Wider touch target */}
      <div
        className={`absolute ${
          isH
            ? "inset-y-0 -left-[10px] w-[26px]"
            : "inset-x-0 -top-[10px] h-[26px]"
        } touch-none`}
        onPointerDown={onPointerDown}
      />
    </div>
  );
}
