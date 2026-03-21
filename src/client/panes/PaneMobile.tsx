import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Satellite, X, Rows2, Maximize2, Plus } from "lucide-react";
import type { PaneType, LeafNode, LayoutState } from "./paneTree";
import { collectLeafTypes } from "./paneTree";
import { useData } from "@/context/DataContext";
import type { Globe } from "lucide-react";

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
  readonly restorePane: (idx: number) => void;
  readonly splitPane: (
    leafId: string,
    dir: "h" | "v",
    newType: PaneType,
  ) => void;
};

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
  restorePane,
  splitPane,
}: PaneMobileProps) {
  const { colorMap } = useData();
  const canCloseMobile = allLeaves.length > 1;

  // ── Add pane menu ───────────────────────────────────────────────
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const availableTypes = useMemo(() => {
    const openTypes = collectLeafTypes(layout.root);
    const minimizedTypes = new Set(layout.minimized.map((m) => m.paneType));
    return (Object.keys(paneMeta) as PaneType[]).filter(
      (t) => !openTypes.has(t) && !minimizedTypes.has(t),
    );
  }, [layout, paneMeta]);

  const handleAddPane = useCallback(
    (type: PaneType) => {
      const activeLeaf = allLeaves[activeMobilePane];
      if (activeLeaf) {
        splitPane(activeLeaf.id, "v", type);
      }
      setAddMenuOpen(false);
    },
    [allLeaves, activeMobilePane, splitPane],
  );

  // Close add menu on outside click
  useEffect(() => {
    if (!addMenuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (
        addMenuRef.current &&
        !addMenuRef.current.contains(e.target as Node)
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

  // ── 2-pane split state ──────────────────────────────────────────
  const [secondPaneIdx, setSecondPaneIdx] = useState<number | null>(null);

  const isSplit =
    secondPaneIdx !== null &&
    secondPaneIdx < allLeaves.length &&
    secondPaneIdx !== activeMobilePane;

  const toggleSplit = useCallback(
    (idx: number) => {
      if (secondPaneIdx === idx) {
        setSecondPaneIdx(null);
      } else if (idx !== activeMobilePane) {
        setSecondPaneIdx(idx);
      }
    },
    [secondPaneIdx, activeMobilePane],
  );

  const handleClose = useCallback(
    (leafId: string, idx: number) => {
      if (secondPaneIdx === idx) setSecondPaneIdx(null);
      else if (secondPaneIdx !== null && idx < secondPaneIdx) {
        setSecondPaneIdx(secondPaneIdx - 1);
      }
      closePane(leafId);
      if (activeMobilePane >= allLeaves.length - 1) {
        setActiveMobilePane(Math.max(0, allLeaves.length - 2));
      }
    },
    [
      secondPaneIdx,
      activeMobilePane,
      allLeaves.length,
      closePane,
      setActiveMobilePane,
    ],
  );

  // Count order matching header toggle order
  const countOrder = [
    "ships",
    "events",
    "quakes",
    "fires",
    "weather",
    "aircraft",
  ] as const;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Mobile status bar */}
      <div className="shrink-0 flex items-center flex-wrap justify-center gap-x-2 gap-y-0 px-2 py-0.5 border-b border-sig-border/30 bg-sig-panel/60">
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
      </div>

      {/* Mobile tab bar */}
      <div className="shrink-0 flex items-center flex-wrap gap-1 px-2 py-1 border-b border-sig-border/50 bg-sig-panel/80">
        {allLeaves.map((lf, i) => {
          const meta = paneMeta[lf.paneType];
          const Icon = meta.icon;
          const isActive = i === activeMobilePane;
          const isSecond = secondPaneIdx === i;
          return (
            <div key={lf.id} className="relative flex items-center">
              <button
                onClick={() => {
                  if (isSecond) {
                    setActiveMobilePane(i);
                    setSecondPaneIdx(null);
                  } else {
                    setActiveMobilePane(i);
                  }
                }}
                className={`flex items-center gap-1 px-2 py-1.5 text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors min-h-8 ${
                  isActive
                    ? "text-sig-accent bg-sig-accent/10 rounded-l"
                    : isSecond
                      ? "text-sig-accent/70 bg-sig-accent/5 rounded-l"
                      : "text-sig-dim bg-transparent rounded"
                } ${
                  (canCloseMobile && isActive) ||
                  (allLeaves.length > 1 && !isActive && !isSecond)
                    ? "pr-1"
                    : "rounded-r"
                }`}
              >
                <Icon size={12} strokeWidth={2.5} />
                <span>{meta.label}</span>
              </button>

              {/* Split button */}
              {allLeaves.length > 1 && !isActive && !isSecond && (
                <button
                  onClick={() => toggleSplit(i)}
                  className="px-1 py-1.5 text-sig-dim min-h-8 rounded-r hover:text-sig-accent transition-colors"
                  title={`Split view with ${meta.label}`}
                >
                  <Rows2 size={10} strokeWidth={2.5} />
                </button>
              )}

              {/* Close button on active tab */}
              {canCloseMobile && isActive && (
                <button
                  onClick={() => handleClose(lf.id, i)}
                  className="px-1 py-1.5 rounded-r text-sig-dim min-h-8 bg-sig-accent/10 transition-colors"
                  title={`Close ${meta.label}`}
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              )}

              {/* Collapse button on second pane tab */}
              {isSecond && (
                <button
                  onClick={() => setSecondPaneIdx(null)}
                  className="px-1 py-1.5 rounded-r text-sig-dim min-h-8 bg-sig-accent/5 hover:text-sig-accent transition-colors"
                  title="Collapse split"
                >
                  <Maximize2 size={10} strokeWidth={2.5} />
                </button>
              )}

              {/* Active indicator */}
              {(isActive || isSecond) && (
                <span
                  className={`absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full ${
                    isActive ? "bg-sig-accent" : "bg-sig-accent/40"
                  }`}
                />
              )}
            </div>
          );
        })}

        {/* Minimized pane tabs */}
        {layout.minimized.map((m, i) => {
          const meta = paneMeta[m.paneType];
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

        {/* Add pane button */}
        {availableTypes.length > 0 && (
          <div ref={addMenuRef} className="relative shrink-0 snap-start">
            <button
              onClick={() => setAddMenuOpen((o) => !o)}
              className="flex items-center justify-center px-2 py-1.5 min-h-8 min-w-8 rounded text-sig-dim hover:text-sig-accent transition-colors"
              title="Add pane"
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
            {addMenuOpen && (
              <div className="absolute bottom-full right-0 mb-1 rounded bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-36 py-1 z-50">
                {availableTypes.map((type) => {
                  const meta = paneMeta[type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => handleAddPane(type)}
                      className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-left text-sig-dim text-(length:--sig-text-sm) tracking-wide hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
                    >
                      <Icon size={14} strokeWidth={2} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex-1" />
      </div>

      {/* Pane content area */}
      {isSplit ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 relative overflow-hidden min-h-0 border-b border-sig-border/40">
            {allLeaves[activeMobilePane] &&
              (() => {
                const lf = allLeaves[activeMobilePane]!;
                const PaneComponent = paneComponents[lf.paneType];
                return <PaneComponent />;
              })()}
          </div>
          <div className="shrink-0 h-1 bg-sig-border/20 flex items-center justify-center">
            <div className="w-8 h-0.5 rounded-full bg-sig-dim/40" />
          </div>
          <div className="flex-1 relative overflow-hidden min-h-0">
            {allLeaves[secondPaneIdx!] &&
              (() => {
                const lf = allLeaves[secondPaneIdx!]!;
                const PaneComponent = paneComponents[lf.paneType];
                return <PaneComponent />;
              })()}
          </div>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          {allLeaves[activeMobilePane] &&
            (() => {
              const lf = allLeaves[activeMobilePane]!;
              const PaneComponent = paneComponents[lf.paneType];
              return <PaneComponent />;
            })()}
        </div>
      )}
    </div>
  );
}
