import { Satellite, X } from "lucide-react";
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
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-sig-border/50 bg-sig-panel/80 overflow-x-auto sigint-scroll snap-x snap-mandatory">
        {allLeaves.map((lf, i) => {
          const meta = paneMeta[lf.paneType];
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
              {active && (
                <span className="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full bg-sig-accent" />
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
      <div className="flex-1 relative overflow-hidden">
        {allLeaves[activeMobilePane] &&
          (() => {
            const lf = allLeaves[activeMobilePane]!;
            const PaneComponent = paneComponents[lf.paneType];
            return <PaneComponent />;
          })()}
      </div>
    </div>
  );
}
