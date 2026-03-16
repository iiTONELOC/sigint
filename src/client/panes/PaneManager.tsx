import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { useData } from "@/context/DataContext";
import { LiveTrafficPane } from "@/panes/live-traffic/LiveTrafficPane";
import { DataTablePane } from "@/panes/data-table/DataTablePane";
import { PaneHeader } from "@/panes/PaneHeader";
import { Globe, Table2, Plus, ArrowLeftRight, ArrowUpDown } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type PaneType = "globe" | "data-table";

type PaneConfig = {
  id: string;
  type: PaneType;
  minimized: boolean;
};

type PaneDirection = "horizontal" | "vertical";

type LayoutState = {
  panes: PaneConfig[];
  direction: PaneDirection;
  sizes: number[]; // fractional sizes (sum to 1)
};

const CACHE_KEY = "sigint.layout.v1";

const PANE_META: Record<PaneType, { label: string; icon: typeof Globe }> = {
  globe: { label: "GLOBE", icon: Globe },
  "data-table": { label: "DATA TABLE", icon: Table2 },
};

const PANE_COMPONENTS: Record<PaneType, React.ComponentType> = {
  globe: LiveTrafficPane,
  "data-table": DataTablePane,
};

// ── Default layout ──────────────────────────────────────────────────

function defaultLayout(): LayoutState {
  return {
    panes: [{ id: "globe-1", type: "globe", minimized: false }],
    direction: "horizontal",
    sizes: [1],
  };
}

function loadLayout(): LayoutState {
  try {
    const cached = cacheGet<LayoutState>(CACHE_KEY);
    if (cached && cached.panes && cached.panes.length > 0) return cached;
  } catch {
    // Ignore
  }
  return defaultLayout();
}

function persistLayout(layout: LayoutState) {
  cacheSet(CACHE_KEY, layout);
}

// ── Helpers ─────────────────────────────────────────────────────────

function rebalanceSizes(count: number, existing: number[]): number[] {
  if (count <= 0) return [];
  if (count === 1) return [1];
  // Equal distribution
  return Array.from({ length: count }, () => 1 / count);
}

let paneIdCounter = 0;
function nextPaneId(type: PaneType): string {
  paneIdCounter += 1;
  return `${type}-${Date.now()}-${paneIdCounter}`;
}

// ── Component ───────────────────────────────────────────────────────

export function PaneManager() {
  const { chromeHidden } = useData();
  const [layout, setLayout] = useState<LayoutState>(loadLayout);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist on change
  useEffect(() => {
    persistLayout(layout);
  }, [layout]);

  const visiblePanes = useMemo(
    () => layout.panes.filter((p) => !p.minimized),
    [layout.panes],
  );

  const minimizedPanes = useMemo(
    () => layout.panes.filter((p) => p.minimized),
    [layout.panes],
  );

  // ── Pane actions ────────────────────────────────────────────────

  const addPane = useCallback((type: PaneType) => {
    setLayout((prev) => {
      const newPane: PaneConfig = {
        id: nextPaneId(type),
        type,
        minimized: false,
      };
      const panes = [...prev.panes, newPane];
      const visibleCount = panes.filter((p) => !p.minimized).length;
      return {
        ...prev,
        panes,
        sizes: rebalanceSizes(visibleCount, prev.sizes),
      };
    });
  }, []);

  const closePane = useCallback((id: string) => {
    setLayout((prev) => {
      const panes = prev.panes.filter((p) => p.id !== id);
      if (panes.length === 0) return defaultLayout();
      const visibleCount = panes.filter((p) => !p.minimized).length;
      return {
        ...prev,
        panes,
        sizes: rebalanceSizes(visibleCount, prev.sizes),
      };
    });
  }, []);

  const toggleMinimize = useCallback((id: string) => {
    setLayout((prev) => {
      const panes = prev.panes.map((p) =>
        p.id === id ? { ...p, minimized: !p.minimized } : p,
      );
      const visibleCount = panes.filter((p) => !p.minimized).length;
      return {
        ...prev,
        panes,
        sizes: rebalanceSizes(visibleCount, prev.sizes),
      };
    });
  }, []);

  const toggleDirection = useCallback(() => {
    setLayout((prev) => ({
      ...prev,
      direction: prev.direction === "horizontal" ? "vertical" : "horizontal",
    }));
  }, []);

  const movePane = useCallback((id: string, delta: -1 | 1) => {
    setLayout((prev) => {
      const idx = prev.panes.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + delta;
      if (newIdx < 0 || newIdx >= prev.panes.length) return prev;
      const panes = [...prev.panes];
      const temp = panes[idx]!;
      panes[idx] = panes[newIdx]!;
      panes[newIdx] = temp;
      return { ...prev, panes };
    });
  }, []);

  // ── Resize handling ─────────────────────────────────────────────
  // During drag: show a position indicator line (no layout changes).
  // On pointer-up: commit final sizes to state (one resize + redraw).

  const onResizeStart = useCallback(
    (index: number, e: React.PointerEvent) => {
      e.preventDefault();
      const isHoriz = layout.direction === "horizontal";
      const startSizes = [...layout.sizes];
      const startPos = isHoriz ? e.clientX : e.clientY;
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const totalSize = isHoriz ? rect.width : rect.height;

      // Create overlay indicator line
      const indicator = document.createElement("div");
      indicator.style.position = "fixed";
      indicator.style.zIndex = "9999";
      indicator.style.pointerEvents = "none";
      if (isHoriz) {
        indicator.style.width = "2px";
        indicator.style.top = rect.top + "px";
        indicator.style.height = rect.height + "px";
        indicator.style.left = e.clientX + "px";
      } else {
        indicator.style.height = "2px";
        indicator.style.left = rect.left + "px";
        indicator.style.width = rect.width + "px";
        indicator.style.top = e.clientY + "px";
      }
      indicator.style.background = "var(--sigint-accent, #00b8d4)";
      indicator.style.opacity = "0.6";
      document.body.appendChild(indicator);
      document.body.style.cursor = isHoriz ? "col-resize" : "row-resize";

      let liveSizes = startSizes;

      const onMove = (ev: PointerEvent) => {
        const pos = isHoriz ? ev.clientX : ev.clientY;
        const delta = (pos - startPos) / totalSize;

        // Calculate final sizes (for commit on up)
        const sizes = [...startSizes];
        const minSize = 0.15;
        const sum = sizes[index]! + sizes[index + 1]!;
        let newA = Math.max(minSize, sizes[index]! + delta);
        if (sum - newA < minSize) newA = sum - minSize;
        sizes[index] = newA;
        sizes[index + 1] = sum - newA;
        liveSizes = sizes;

        // Move indicator only
        if (isHoriz) {
          indicator.style.left =
            Math.max(rect.left, Math.min(rect.right, pos)) + "px";
        } else {
          indicator.style.top =
            Math.max(rect.top, Math.min(rect.bottom, pos)) + "px";
        }
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        indicator.remove();

        // Single state update
        setLayout((prev) => ({ ...prev, sizes: liveSizes }));
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [layout.direction, layout.sizes, layout.panes],
  );

  // ── Available pane types to add ─────────────────────────────────

  const availableTypes = useMemo<PaneType[]>(() => {
    const openTypes = new Set(layout.panes.map((p) => p.type));
    return (Object.keys(PANE_META) as PaneType[]).filter(
      (t) => !openTypes.has(t),
    );
  }, [layout.panes]);

  // ── Add pane menu ───────────────────────────────────────────────

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // ── Mobile detection ─────────────────────────────────────────────

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [activeMobilePane, setActiveMobilePane] = useState(0);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Clamp active tab if panes change
  useEffect(() => {
    if (activeMobilePane >= visiblePanes.length) {
      setActiveMobilePane(Math.max(0, visiblePanes.length - 1));
    }
  }, [visiblePanes.length, activeMobilePane]);

  // ── Grid template ───────────────────────────────────────────────

  const gridTemplate = useMemo(() => {
    if (visiblePanes.length === 0) return "1fr";
    let sizeIdx = 0;
    const parts: string[] = [];
    for (const pane of layout.panes) {
      if (pane.minimized) continue;
      const size = layout.sizes[sizeIdx] ?? 1 / visiblePanes.length;
      parts.push(`${size}fr`);
      sizeIdx++;
    }
    const result: string[] = [];
    parts.forEach((p, i) => {
      if (i > 0) result.push("4px");
      result.push(p);
    });
    return result.join(" ");
  }, [visiblePanes, layout.panes, layout.sizes]);

  // ── Render ──────────────────────────────────────────────────────

  const isHoriz = layout.direction === "horizontal";
  const multiPane = layout.panes.length > 1 || minimizedPanes.length > 0;

  // ── MOBILE: tabs + single pane ──────────────────────────────────
  if (isMobile) {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden">
        {/* Tab bar + controls */}
        {!chromeHidden && (
          <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 border-b border-sig-border/50 bg-sig-panel/60 overflow-x-auto">
            {/* Pane tabs */}
            {visiblePanes.map((pane, i) => {
              const meta = PANE_META[pane.type];
              const Icon = meta.icon;
              const active = i === activeMobilePane;
              return (
                <button
                  key={pane.id}
                  onClick={() => setActiveMobilePane(i)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold shrink-0 transition-colors border ${
                    active
                      ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
                      : "text-sig-dim bg-transparent border-sig-border/50"
                  }`}
                >
                  <Icon size={11} strokeWidth={2.5} />
                  {meta.label}
                </button>
              );
            })}

            {/* Minimized tabs */}
            {minimizedPanes.map((pane) => {
              const meta = PANE_META[pane.type];
              const Icon = meta.icon;
              return (
                <button
                  key={pane.id}
                  onClick={() => toggleMinimize(pane.id)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-sig-panel/80 border border-sig-border/50 shrink-0 opacity-50"
                  title={`Restore ${meta.label}`}
                >
                  <Icon size={11} strokeWidth={2.5} />
                  {meta.label}
                </button>
              );
            })}

            <div className="flex-1" />

            {/* Add pane */}
            {availableTypes.length > 0 && (
              <div ref={menuRef} className="relative shrink-0">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border/50"
                  title="Add pane"
                >
                  <Plus size={11} strokeWidth={2.5} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 rounded overflow-hidden bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-36">
                    {availableTypes.map((type) => {
                      const meta = PANE_META[type];
                      const Icon = meta.icon;
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            addPane(type);
                            setMenuOpen(false);
                            setActiveMobilePane(visiblePanes.length);
                          }}
                          className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-sig-text text-(length:--sig-text-md) bg-transparent border-none hover:bg-sig-accent/10 transition-colors"
                        >
                          <Icon
                            size={13}
                            strokeWidth={2.5}
                            className="text-sig-accent"
                          />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Single active pane */}
        <div className="flex-1 relative overflow-hidden">
          {visiblePanes[activeMobilePane] &&
            (() => {
              const pane = visiblePanes[activeMobilePane]!;
              const PaneComponent = PANE_COMPONENTS[pane.type];
              return <PaneComponent />;
            })()}
        </div>
      </div>
    );
  }

  // ── DESKTOP: grid layout ────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* ── Minimized pane tabs + controls ── */}
      {!chromeHidden && (
        <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 border-b border-sig-border/50 bg-sig-panel/60">
          {/* Minimized tabs */}
          {minimizedPanes.map((pane) => {
            const meta = PANE_META[pane.type];
            const Icon = meta.icon;
            return (
              <button
                key={pane.id}
                onClick={() => toggleMinimize(pane.id)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-sig-panel/80 border border-sig-border/50 hover:text-sig-accent transition-colors"
                title={`Restore ${meta.label}`}
              >
                <Icon size={11} strokeWidth={2.5} />
                {meta.label}
              </button>
            );
          })}

          <div className="flex-1" />

          {/* Direction toggle */}
          {visiblePanes.length > 1 && (
            <button
              onClick={toggleDirection}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border/50 hover:text-sig-accent transition-colors"
              title={isHoriz ? "Stack vertically" : "Split horizontally"}
            >
              {isHoriz ? (
                <ArrowUpDown size={11} strokeWidth={2.5} />
              ) : (
                <ArrowLeftRight size={11} strokeWidth={2.5} />
              )}
            </button>
          )}

          {/* Add pane */}
          {availableTypes.length > 0 && (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border/50 hover:text-sig-accent transition-colors"
                title="Add pane"
              >
                <Plus size={11} strokeWidth={2.5} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 rounded overflow-hidden bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-36">
                  {availableTypes.map((type) => {
                    const meta = PANE_META[type];
                    const Icon = meta.icon;
                    return (
                      <button
                        key={type}
                        onClick={() => {
                          addPane(type);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-sig-text text-(length:--sig-text-md) bg-transparent border-none hover:bg-sig-accent/10 transition-colors"
                      >
                        <Icon
                          size={13}
                          strokeWidth={2.5}
                          className="text-sig-accent"
                        />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Pane grid ── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{
          display: "grid",
          [isHoriz ? "gridTemplateColumns" : "gridTemplateRows"]: gridTemplate,
        }}
      >
        {visiblePanes.map((pane, vIdx) => {
          const meta = PANE_META[pane.type];
          const PaneComponent = PANE_COMPONENTS[pane.type];
          const showHeader = !chromeHidden && multiPane;

          const elements: ReactNode[] = [];

          // Resize handle before this pane (except first)
          if (vIdx > 0) {
            elements.push(
              <div
                key={`resize-${vIdx}`}
                className={`relative ${isHoriz ? "cursor-col-resize w-[4px]" : "cursor-row-resize h-[4px]"} bg-sig-border/30 transition-colors hover:bg-sig-accent/30`}
                onPointerDown={(e) => onResizeStart(vIdx - 1, e)}
              >
                {/* Invisible wider touch target */}
                <div
                  className={`absolute ${isHoriz ? "inset-y-0 -left-[10px] w-[24px]" : "inset-x-0 -top-[10px] h-[24px]"} touch-none`}
                  onPointerDown={(e) => onResizeStart(vIdx - 1, e)}
                />
              </div>,
            );
          }

          elements.push(
            <div
              key={pane.id}
              className="overflow-hidden flex flex-col min-w-0 min-h-0"
            >
              {showHeader && (
                <PaneHeader
                  label={meta.label}
                  icon={meta.icon}
                  onMinimize={() => toggleMinimize(pane.id)}
                  onClose={
                    layout.panes.length > 1
                      ? () => closePane(pane.id)
                      : undefined
                  }
                  onMoveLeft={
                    vIdx > 0 ? () => movePane(pane.id, -1) : undefined
                  }
                  onMoveRight={
                    vIdx < visiblePanes.length - 1
                      ? () => movePane(pane.id, 1)
                      : undefined
                  }
                  direction={layout.direction}
                />
              )}
              <div className="flex-1 relative overflow-hidden">
                <PaneComponent />
              </div>
            </div>,
          );

          return elements;
        })}
      </div>
    </div>
  );
}
