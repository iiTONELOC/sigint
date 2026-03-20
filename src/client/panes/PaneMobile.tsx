import { useState, useCallback } from "react";
import { Satellite, X, Rows2, Maximize2 } from "lucide-react";
import type { PaneType, LeafNode, LayoutState } from "./paneTree";
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
}: PaneMobileProps) {
  const canCloseMobile = allLeaves.length > 1;

  // ── 2-pane split state ──────────────────────────────────────────
  // secondPaneIdx: index of the pane shown in the bottom half, or null for single-pane mode
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
        {Object.entries(counts).map(([key, count]) => (
          <span
            key={key}
            className="text-sig-dim text-(length:--sig-text-xs) tabular-nums"
          >
            {count > 0 ? count : null}
          </span>
        ))}
      </div>

      {/* Mobile tab bar */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-sig-border/50 bg-sig-panel/80 overflow-x-auto sigint-scroll snap-x snap-mandatory">
        {allLeaves.map((lf, i) => {
          const meta = paneMeta[lf.paneType];
          const Icon = meta.icon;
          const isActive = i === activeMobilePane;
          const isSecond = secondPaneIdx === i;
          return (
            <div
              key={lf.id}
              className="relative flex items-center shrink-0 snap-start"
            >
              <button
                onClick={() => {
                  if (isSecond) {
                    // Tapping the secondary tab promotes it to primary, collapses split
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
                <span className="max-w-16 truncate">{meta.label}</span>
              </button>

              {/* Split button — on non-active, non-second tabs */}
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
        <div className="flex-1" />
      </div>

      {/* Pane content area — single or 2-pane vertical split */}
      {isSplit ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top pane */}
          <div className="flex-1 relative overflow-hidden min-h-0 border-b border-sig-border/40">
            {allLeaves[activeMobilePane] &&
              (() => {
                const lf = allLeaves[activeMobilePane]!;
                const PaneComponent = paneComponents[lf.paneType];
                return <PaneComponent />;
              })()}
          </div>
          {/* Split separator */}
          <div className="shrink-0 h-1 bg-sig-border/20 flex items-center justify-center">
            <div className="w-8 h-0.5 rounded-full bg-sig-dim/40" />
          </div>
          {/* Bottom pane */}
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
