import { useState, useCallback, useRef, useEffect } from "react";
import { useData } from "@/context/DataContext";
import { useIsMobileLayout } from "@/context/LayoutModeContext";
import {
  useHasDossier,
  requestDossierOpen,
  useWalkthroughActive,
  useWalkthroughStepId,
} from "@/lib/layoutSignals";
import type { DataPoint } from "@/features/base/dataPoints";
import { GlobeVisualization } from "@/components/globe";
import { DetailPanel } from "@/components/DetailPanel";
import { Tooltip } from "@/components/Tooltip";
import {
  Eye,
  Pause,
  Play,
  X,
  Globe as GlobeIcon,
  Map,
  Zap,
  Link2,
  Radio,
} from "lucide-react";

export function LiveTrafficPane() {
  const {
    allData,
    layers,
    aircraftFilter,
    flat,
    setFlat,
    autoRotate,
    setAutoRotate,
    rotationSpeed,
    setRotationSpeed,
    selectedCurrent,
    isolateMode,
    setSelected,
    setIsolateMode,
    chromeHidden,
    setChromeHidden,
    zoomToId,
    setZoomToId,
    revealId,
    searchMatchIds,
    spatialGrid,
    filteredIds,
    watchActive,
    watchPaused,
    watchMode,
    startWatch,
    stopWatch,
    pauseWatch,
    resumeWatch,
  } = useData();

  const [panelSide, setPanelSide] = useState<"left" | "right">("right");
  const [watchMenuOpen, setWatchMenuOpen] = useState(false);
  const watchMenuRef = useRef<HTMLDivElement>(null);
  const hasDossier = useHasDossier();
  const walkthroughActive = useWalkthroughActive();
  const walkthroughStepId = useWalkthroughStepId();
  const isMobileLayout = useIsMobileLayout();

  // Close watch menu on outside click
  useEffect(() => {
    if (!watchMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        watchMenuRef.current &&
        !watchMenuRef.current.contains(e.target as Node)
      )
        setWatchMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [watchMenuOpen]);

  const handleSetIsolateMode = useCallback(
    (mode: null | "solo" | "focus") => {
      setIsolateMode(mode);
    },
    [setIsolateMode],
  );

  const handleZoomToSelected = useCallback(() => {
    if (selectedCurrent) {
      setZoomToId(selectedCurrent.id);
      setTimeout(() => setZoomToId(null), 100);
    }
  }, [setZoomToId, selectedCurrent]);

  const handleSelect = useCallback(
    (item: DataPoint | null) => {
      if (!item) {
        setSelected(null);
        setIsolateMode(null);
        return;
      }
      if (chromeHidden && !isMobileLayout) setChromeHidden(false);
      setAutoRotate(false);
      setSelected(item);
    },
    [chromeHidden, setChromeHidden, setSelected, setAutoRotate, setIsolateMode, isMobileLayout],
  );

  // Step IDs where globe click-through is allowed during walkthrough
  const WALKTHROUGH_CLICK_STEPS = new Set([
    "globe-select",
    "globe-deselect",
    "focus-enter",
    "focus-exit",
  ]);

  const handleRawCanvasClick = useCallback(() => {
    // On mobile, tapping empty canvas should NOT toggle chrome or deselect.
    // Users scroll via the vertical pane column; chrome toggle is desktop-only.
    if (isMobileLayout) return;

    // During walkthrough, only allow interaction on specific steps
    if (
      walkthroughActive &&
      !WALKTHROUGH_CLICK_STEPS.has(walkthroughStepId ?? "")
    )
      return;

    if (selectedCurrent) {
      setSelected(null);
      setIsolateMode(null);
      return;
    }
    setChromeHidden((v) => {
      const next = !v;
      if (next) {
        setSelected(null);
        setIsolateMode(null);
      }
      return next;
    });
  }, [
    selectedCurrent,
    setChromeHidden,
    setSelected,
    setIsolateMode,
    walkthroughActive,
    walkthroughStepId,
    isMobileLayout,
  ]);

  const handleClose = useCallback(() => {
    setSelected(null);
    setIsolateMode(null);
  }, [setSelected, setIsolateMode]);

  return (
    <>
      <GlobeVisualization
        data={allData}
        layers={layers}
        aircraftFilter={aircraftFilter}
        flat={flat}
        autoRotate={autoRotate}
        rotationSpeed={rotationSpeed}
        onSelect={handleSelect}
        onRawCanvasClick={handleRawCanvasClick}
        onMiddleClick={() => setAutoRotate((v) => !v)}
        selected={selectedCurrent}
        isolatedId={isolateMode ? (selectedCurrent?.id ?? null) : null}
        isolateMode={isolateMode}
        zoomToId={zoomToId}
        revealId={revealId}
        searchMatchIds={searchMatchIds}
        onSelectedSide={setPanelSide}
        spatialGrid={spatialGrid}
        filteredIds={filteredIds}
      />

      {/* ── View controls — top-left overlay on globe ─────────────── */}
      {!chromeHidden && (
        <div
          data-tour="globe-controls"
          className="absolute top-2 left-2 md:top-3 md:left-3 z-10 flex items-center gap-1 flex-wrap"
        >
          <Tooltip
            content={flat ? "Switch to globe view" : "Switch to flat map"}
            placement="bottom"
          >
            <button
              onClick={() => setFlat(!flat)}
              className="px-2 py-1 rounded tracking-wider min-h-9 font-semibold text-sig-accent text-(length:--sig-text-btn) bg-sig-panel/75 border border-sig-border/50 hover:bg-sig-panel transition-colors flex items-center gap-1"
            >
              {flat ? (
                <>
                  <GlobeIcon size={12} strokeWidth={2.5} /> GLOBE
                </>
              ) : (
                <>
                  <Map size={12} strokeWidth={2.5} /> FLAT
                </>
              )}
            </button>
          </Tooltip>

          <Tooltip
            content={autoRotate ? "Pause rotation" : "Resume rotation"}
            placement="bottom"
            shortcut="Space / Middle-click"
          >
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`px-2 py-1 rounded tracking-wider min-h-9 font-semibold text-(length:--sig-text-btn) border transition-colors flex items-center gap-1 ${
                autoRotate
                  ? "text-sig-accent bg-sig-accent/15 border-sig-accent/45"
                  : "text-sig-dim bg-sig-panel/75 border-sig-border/50 hover:bg-sig-panel"
              }`}
            >
              {autoRotate ? (
                <>
                  <Pause size={11} strokeWidth={2.5} /> ROT
                </>
              ) : (
                <>
                  <Play size={11} strokeWidth={2.5} /> ROT
                </>
              )}
            </button>
          </Tooltip>

          {/* Watch mode */}
          <div className="relative" ref={watchMenuRef}>
            {!watchActive && (
              <Tooltip
                content="Auto-tour alerts/intel on globe"
                placement="bottom"
              >
                <button
                  onClick={() => setWatchMenuOpen((v) => !v)}
                  className="px-2 py-1 rounded tracking-wider min-h-9 font-semibold text-(length:--sig-text-btn) border transition-colors text-sig-dim bg-sig-panel/75 border-sig-border/50 hover:bg-sig-panel flex items-center gap-1"
                >
                  <Eye size={11} strokeWidth={2.5} /> WATCH
                </button>
              </Tooltip>
            )}
            {watchActive && !watchPaused && (
              <Tooltip content="Pause watch" placement="bottom">
                <button
                  onClick={pauseWatch}
                  className="px-2 py-1 rounded tracking-wider min-h-9 font-semibold text-(length:--sig-text-btn) border transition-colors text-sig-accent bg-sig-accent/15 border-sig-accent/45 flex items-center gap-1"
                >
                  <Pause size={11} strokeWidth={2.5} /> WATCH
                </button>
              </Tooltip>
            )}
            {watchActive && watchPaused && (
              <div className="flex items-center gap-0.5">
                <Tooltip content="Resume watch" placement="bottom">
                  <button
                    onClick={resumeWatch}
                    className="px-2 py-1 rounded-l tracking-wider min-h-9 font-semibold text-(length:--sig-text-btn) border border-r-0 transition-colors text-yellow-400 bg-yellow-400/10 border-yellow-400/30 hover:bg-yellow-400/20 flex items-center gap-1"
                  >
                    <Play size={11} strokeWidth={2.5} /> RESUME
                  </button>
                </Tooltip>
                <Tooltip content="Stop watch" placement="bottom">
                  <button
                    onClick={stopWatch}
                    className="px-2 py-1 rounded-r tracking-wider min-h-9 font-semibold text-(length:--sig-text-btn) border transition-colors text-sig-dim bg-sig-panel/75 border-sig-border/50 hover:text-sig-danger flex items-center justify-center"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </Tooltip>
              </div>
            )}
            {watchMenuOpen && !watchActive && (
              <div className="absolute top-full left-0 mt-1 bg-sig-panel border border-sig-border/60 rounded shadow-lg py-0.5 min-w-24 z-30">
                {(["alerts", "intel", "all"] as const).map((src) => (
                  <button
                    key={src}
                    onClick={() => {
                      startWatch(src);
                      setWatchMenuOpen(false);
                    }}
                    className="w-full px-2.5 py-1 bg-transparent border-none text-left hover:bg-sig-accent/10 transition-colors text-sig-bright text-(length:--sig-text-md) tracking-wider flex items-center gap-1.5"
                  >
                    {src === "alerts" ? (
                      <>
                        <Zap size={11} strokeWidth={2.5} /> ALERTS
                      </>
                    ) : src === "intel" ? (
                      <>
                        <Link2 size={11} strokeWidth={2.5} /> INTEL
                      </>
                    ) : (
                      <>
                        <Radio size={11} strokeWidth={2.5} /> ALL
                      </>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {watchActive && (
            <span
              className={`text-[10px] tracking-wider font-mono bg-sig-panel/75 px-1.5 py-0.5 rounded border ${
                watchPaused
                  ? "text-yellow-400 border-yellow-400/30"
                  : "text-sig-accent border-sig-accent/30"
              }`}
            >
              {watchPaused ? "PAUSED " : ""}
              {watchMode.index + 1}/{watchMode.items.length} ·{" "}
              {watchMode.source.toUpperCase()}
            </span>
          )}

          <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-sig-panel/75 border border-sig-border/50">
            <span className="text-sig-dim text-(length:--sig-text-sm)">
              SPD
            </span>
            <input
              type="range"
              aria-label="Rotation speed"
              title="Rotation speed"
              min={0.01}
              max={2}
              step={0.01}
              value={rotationSpeed}
              onChange={(e) => setRotationSpeed(Number(e.target.value))}
              className="w-12 md:w-15 cursor-pointer accent-sig-accent touch-none"
            />
          </div>
        </div>
      )}

      {/* ── Detail panel ──────────────────────────────────────────── */}
      {!chromeHidden && !hasDossier && (
        <DetailPanel
          item={selectedCurrent}
          onClose={handleClose}
          isolateMode={isolateMode}
          onSetIsolateMode={handleSetIsolateMode}
          onZoomTo={handleZoomToSelected}
          side={panelSide}
          onOpenDossier={requestDossierOpen}
        />
      )}
    </>
  );
}
