import { useState, useCallback } from "react";
import { useData } from "@/context/DataContext";
import { useHasDossier, requestDossierOpen } from "@/panes/paneLayoutContext";
import type { DataPoint } from "@/features/base/dataPoints";
import { GlobeVisualization } from "@/components/globe";
import { DetailPanel } from "@/components/DetailPanel";
import { Tooltip } from "@/components/Tooltip";

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
    searchMatchIds,
    spatialGrid,
    filteredIds,
  } = useData();

  const [panelSide, setPanelSide] = useState<"left" | "right">("right");
  const hasDossier = useHasDossier();

  const handleSetIsolateMode = useCallback(
    (mode: null | "solo" | "focus") => {
      setIsolateMode(mode);
      if (selectedCurrent) {
        setZoomToId(selectedCurrent.id);
        setTimeout(() => setZoomToId(null), 100);
      }
    },
    [setIsolateMode, setZoomToId, selectedCurrent],
  );

  const handleSelect = useCallback(
    (item: DataPoint | null) => {
      if (!item) {
        setSelected(null);
        setIsolateMode(null);
        return;
      }
      if (chromeHidden) setChromeHidden(false);
      setAutoRotate(false);
      setSelected(item);
    },
    [chromeHidden, setChromeHidden, setSelected, setAutoRotate, setIsolateMode],
  );

  const handleRawCanvasClick = useCallback(() => {
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
  }, [selectedCurrent, setChromeHidden, setSelected, setIsolateMode]);

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
        searchMatchIds={searchMatchIds}
        onSelectedSide={setPanelSide}
        spatialGrid={spatialGrid}
        filteredIds={filteredIds}
      />

      {/* ── View controls — top-left overlay on globe ─────────────── */}
      {!chromeHidden && (
        <div className="absolute top-2 left-2 md:top-3 md:left-3 z-10 flex items-center gap-1">
          <Tooltip
            content={flat ? "Switch to globe view" : "Switch to flat map"}
            placement="bottom"
          >
            <button
              onClick={() => setFlat(!flat)}
              className="px-1.5 py-0.5 rounded tracking-wider font-semibold text-sig-accent text-(length:--sig-text-btn) bg-sig-panel/75 border border-sig-border/50 hover:bg-sig-panel transition-colors"
            >
              {flat ? "\u25C9 GLOBE" : "\u25AD FLAT"}
            </button>
          </Tooltip>

          <Tooltip
            content={autoRotate ? "Pause rotation" : "Resume rotation"}
            placement="bottom"
            shortcut="Space / Middle-click"
          >
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`px-1.5 py-0.5 rounded tracking-wider font-semibold text-(length:--sig-text-btn) border transition-colors ${
                autoRotate
                  ? "text-sig-accent bg-sig-accent/15 border-sig-accent/45"
                  : "text-sig-dim bg-sig-panel/75 border-sig-border/50 hover:bg-sig-panel"
              }`}
            >
              {autoRotate ? "⏸ ROT" : "▶ ROT"}
            </button>
          </Tooltip>

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
              className="w-12 md:w-15 cursor-pointer accent-sig-accent"
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
          side={panelSide}
          onOpenDossier={requestDossierOpen}
        />
      )}
    </>
  );
}
