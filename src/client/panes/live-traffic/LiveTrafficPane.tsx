import {
  PanelSide,
  RenderRotationSpeedPolicy,
  type SelectedIsolateMode,
} from "@/workers/render/protocol";
import { useState, useCallback, useRef, useEffect } from "react";
import { zoomToThenClear } from "@/lib/runtime/revealSignals";
import { useData, WatchSource } from "@/context/DataContext";
import { useLayoutMode } from "@/context/LayoutModeContext";
import {
  useHasDossier,
  requestDossierOpen,
  useWalkthroughActive,
  useWalkthroughStepId,
} from "@/lib/runtime/layoutSignals";
import type { DataPoint } from "@/features/base/dataPoints";
import { GlobeVisualization } from "@/components/globe";
import { DetailPanel } from "@/components/DetailPanel";
import { Tooltip, TooltipPlacement } from "@/components/Tooltip";
import { IconStrokeWidth } from "@/features/base/types";
import { DomEvent } from "@/lib/runtime/domEvent";
import { ButtonType } from "@/lib/ui/button";
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

enum LiveTrafficIconSize {
  PrimaryPx = 12,
  SecondaryPx = 11,
}

enum LiveTrafficLabel {
  RotationSpeed = "Rotation speed",
}

enum LiveTrafficClassName {
  WatchStatus = "text-(length:--sig-text-xs) tracking-wider font-mono bg-sig-panel/75 px-1.5 py-0.5 rounded border",
}

const WATCH_SOURCE_ICONS = {
  [WatchSource.Alerts]: Zap,
  [WatchSource.Intel]: Link2,
  [WatchSource.All]: Radio,
};

export function LiveTrafficPane() {
  const {
    flat,
    setFlat,
    autoRotate,
    setAutoRotate,
    toggleAutoRotate,
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
    searchText,
    watchActive,
    watchPaused,
    watchMode,
    startWatch,
    stopWatch,
    pauseWatch,
    resumeWatch,
  } = useData();

  const [panelSide, setPanelSide] = useState<PanelSide>(PanelSide.Right);
  const [watchMenuOpen, setWatchMenuOpen] = useState(false);
  const watchMenuRef = useRef<HTMLDivElement>(null);
  const hasDossier = useHasDossier();
  const walkthroughActive = useWalkthroughActive();
  const walkthroughStepId = useWalkthroughStepId();
  const { isMobile: isMobileLayout, deviceType } = useLayoutMode();
  const isPhone = deviceType === "phone";

  useEffect(() => {
    if (isMobileLayout && selectedCurrent && !hasDossier) requestDossierOpen();
  }, [isMobileLayout, selectedCurrent, hasDossier]);

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
    document.addEventListener(DomEvent.MouseDown, handler);
    return () => document.removeEventListener(DomEvent.MouseDown, handler);
  }, [watchMenuOpen]);

  const handleSetIsolateMode = useCallback(
    (mode: SelectedIsolateMode) => {
      setIsolateMode(mode);
    },
    [setIsolateMode],
  );

  const handleZoomToSelected = useCallback(() => {
    if (selectedCurrent) {
      zoomToThenClear(setZoomToId, selectedCurrent.id);
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
    if (isPhone) return;
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
    isPhone,
  ]);

  const handleClose = useCallback(() => {
    setSelected(null);
    setIsolateMode(null);
  }, [setSelected, setIsolateMode]);

  // Stable ref so the memoized globe doesn't re-render on every pane render.
  const handleMiddleClick = useCallback(
    () => toggleAutoRotate(),
    [toggleAutoRotate],
  );

  return (
    <>
      <GlobeVisualization
        onSelect={handleSelect}
        onIsolateModeChange={handleSetIsolateMode}
        onRawCanvasClick={handleRawCanvasClick}
        onMiddleClick={handleMiddleClick}
        selected={selectedCurrent}
        isolatedId={isolateMode ? (selectedCurrent?.id ?? null) : null}
        isolateMode={isolateMode}
        zoomToId={zoomToId}
        revealId={revealId}
        searchText={searchText}
        onSelectedSide={setPanelSide}
      />

      {/* View controls in the globe's top-left corner. */}
      {!chromeHidden && (
        <div
          data-tour="globe-controls"
          className="absolute top-2 left-2 md:top-3 md:left-3 z-10 flex items-center gap-1 flex-wrap"
        >
          <Tooltip
            content={flat ? "Switch to globe view" : "Switch to flat map"}
            placement={TooltipPlacement.Bottom}
          >
            <button
              type={ButtonType.Button}
              onClick={() => setFlat(!flat)}
              className="px-2 py-1 rounded tracking-wider min-h-9 font-semibold text-sig-accent text-(length:--sig-text-btn) bg-sig-panel/75 border border-sig-border/50 hover:bg-sig-panel transition-colors flex items-center gap-1"
            >
              {flat ? (
                <>
                  <GlobeIcon
                    size={LiveTrafficIconSize.PrimaryPx}
                    strokeWidth={IconStrokeWidth.Standard}
                  />{" "}
                  GLOBE
                </>
              ) : (
                <>
                  <Map
                    size={LiveTrafficIconSize.PrimaryPx}
                    strokeWidth={IconStrokeWidth.Standard}
                  />{" "}
                  FLAT
                </>
              )}
            </button>
          </Tooltip>

          <Tooltip
            content={autoRotate ? "Pause rotation" : "Resume rotation"}
            placement={TooltipPlacement.Bottom}
            shortcut="Space / Middle-click"
          >
            <button
              type={ButtonType.Button}
              onClick={() => setAutoRotate(!autoRotate)}
              className={`px-2 py-1 rounded tracking-wider min-h-9 font-semibold text-(length:--sig-text-btn) border transition-colors flex items-center gap-1 ${
                autoRotate
                  ? "text-sig-accent bg-sig-accent/15 border-sig-accent/45"
                  : "text-sig-dim bg-sig-panel/75 border-sig-border/50 hover:bg-sig-panel"
              }`}
            >
              {autoRotate ? (
                <>
                  <Pause
                    size={LiveTrafficIconSize.SecondaryPx}
                    strokeWidth={IconStrokeWidth.Standard}
                  />{" "}
                  ROT
                </>
              ) : (
                <>
                  <Play
                    size={LiveTrafficIconSize.SecondaryPx}
                    strokeWidth={IconStrokeWidth.Standard}
                  />{" "}
                  ROT
                </>
              )}
            </button>
          </Tooltip>

          {/* Watch mode */}
          <div className="relative" ref={watchMenuRef}>
            {!watchActive && (
              <Tooltip
                content="Auto-tour alerts/intel on globe"
                placement={TooltipPlacement.Bottom}
              >
                <button
                  type={ButtonType.Button}
                  onClick={() => setWatchMenuOpen((v) => !v)}
                  className="px-2 py-1 rounded tracking-wider min-h-9 font-semibold text-(length:--sig-text-btn) border transition-colors text-sig-dim bg-sig-panel/75 border-sig-border/50 hover:bg-sig-panel flex items-center gap-1"
                >
                  <Eye
                    size={LiveTrafficIconSize.SecondaryPx}
                    strokeWidth={IconStrokeWidth.Standard}
                  />{" "}
                  WATCH
                </button>
              </Tooltip>
            )}
            {watchActive && !watchPaused && (
              <Tooltip
                content="Pause watch"
                placement={TooltipPlacement.Bottom}
              >
                <button
                  type={ButtonType.Button}
                  onClick={pauseWatch}
                  className="px-2 py-1 rounded tracking-wider min-h-9 font-semibold text-(length:--sig-text-btn) border transition-colors text-sig-accent bg-sig-accent/15 border-sig-accent/45 flex items-center gap-1"
                >
                  <Pause
                    size={LiveTrafficIconSize.SecondaryPx}
                    strokeWidth={IconStrokeWidth.Standard}
                  />{" "}
                  WATCH
                </button>
              </Tooltip>
            )}
            {watchActive && watchPaused && (
              <div className="flex items-center gap-0.5">
                <Tooltip
                  content="Resume watch"
                  placement={TooltipPlacement.Bottom}
                >
                  <button
                    type={ButtonType.Button}
                    onClick={resumeWatch}
                    className="px-2 py-1 rounded-l tracking-wider min-h-9 font-semibold text-(length:--sig-text-btn) border border-r-0 transition-colors text-yellow-400 bg-yellow-400/10 border-yellow-400/30 hover:bg-yellow-400/20 flex items-center gap-1"
                  >
                    <Play
                      size={LiveTrafficIconSize.SecondaryPx}
                      strokeWidth={IconStrokeWidth.Standard}
                    />{" "}
                    RESUME
                  </button>
                </Tooltip>
                <Tooltip
                  content="Stop watch"
                  placement={TooltipPlacement.Bottom}
                >
                  <button
                    type={ButtonType.Button}
                    onClick={stopWatch}
                    className="px-2 py-1 rounded-r tracking-wider min-h-9 font-semibold text-(length:--sig-text-btn) border transition-colors text-sig-dim bg-sig-panel/75 border-sig-border/50 hover:text-sig-danger flex items-center justify-center"
                  >
                    <X
                      size={LiveTrafficIconSize.PrimaryPx}
                      strokeWidth={IconStrokeWidth.Standard}
                    />
                  </button>
                </Tooltip>
              </div>
            )}
            {watchMenuOpen && !watchActive && (
              <div className="absolute top-full left-0 mt-1 bg-sig-panel border border-sig-border/60 rounded shadow-lg py-0.5 min-w-24 z-30">
                {Object.values(WatchSource).map((source) => {
                  const Icon = WATCH_SOURCE_ICONS[source];
                  return (
                    <button
                      type={ButtonType.Button}
                      key={source}
                      onClick={() => {
                        startWatch(source);
                        setWatchMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1 bg-transparent border-none text-left hover:bg-sig-accent/10 transition-colors text-sig-bright text-(length:--sig-text-md) tracking-wider flex items-center gap-1.5"
                    >
                      <Icon
                        size={LiveTrafficIconSize.SecondaryPx}
                        strokeWidth={IconStrokeWidth.Standard}
                      />{" "}
                      {source.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {watchActive && (
            <span
              className={`${LiveTrafficClassName.WatchStatus} ${
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
              aria-label={LiveTrafficLabel.RotationSpeed}
              title={LiveTrafficLabel.RotationSpeed}
              min={RenderRotationSpeedPolicy.MinimumAndStep}
              max={RenderRotationSpeedPolicy.Maximum}
              step={RenderRotationSpeedPolicy.MinimumAndStep}
              value={rotationSpeed}
              onChange={(e) => setRotationSpeed(Number(e.target.value))}
              className="w-12 md:w-15 cursor-pointer accent-sig-accent touch-none"
            />
          </div>
        </div>
      )}

      {/* ── Detail panel ──────────────────────────────────────────── */}
      {!chromeHidden && !hasDossier && !isMobileLayout && (
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
