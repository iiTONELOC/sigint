import { useState, useCallback } from "react";
import { useData } from "@/context/DataContext";
import type { DataPoint } from "@/features/base/dataPoints";
import { GlobeVisualization } from "@/components/globe";
import { DetailPanel } from "@/components/DetailPanel";
import { LayerLegend } from "@/components/LayerLegend";
import { StatusBadge } from "@/components/StatusBadge";

export function LiveTrafficPane() {
  const {
    allData,
    layers,
    aircraftFilter,
    flat,
    autoRotate,
    setAutoRotate,
    rotationSpeed,
    selectedCurrent,
    isolateMode,
    setSelected,
    setIsolateMode,
    chromeHidden,
    setChromeHidden,
    zoomToId,
    setZoomToId,
    searchMatchIds,
    counts,
    activeCount,
    dataSources,
    spatialGrid,
    filteredIds,
  } = useData();

  const [panelSide, setPanelSide] = useState<"left" | "right">("right");

  const handleSetIsolateMode = useCallback(
    (mode: null | "solo" | "focus") => {
      setIsolateMode(mode);
      // Zoom to the selected point when entering Focus or Solo
      if (mode && selectedCurrent) {
        setZoomToId(selectedCurrent.id);
        setTimeout(() => setZoomToId(null), 100);
      }
    },
    [setIsolateMode, setZoomToId, selectedCurrent],
  );

  const handleSelect = useCallback(
    (item: DataPoint | null) => {
      if (!item) {
        // Click on empty space — deselect
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
    setChromeHidden((v) => {
      const next = !v;
      if (next) {
        setSelected(null);
        setIsolateMode(null);
      }
      return next;
    });
  }, [setChromeHidden, setSelected, setIsolateMode]);

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
      {!chromeHidden && (
        <DetailPanel
          item={selectedCurrent}
          onClose={handleClose}
          isolateMode={isolateMode}
          onSetIsolateMode={handleSetIsolateMode}
          side={panelSide}
        />
      )}

      {!chromeHidden && <LayerLegend layers={layers} counts={counts} />}

      {!chromeHidden && (
        <StatusBadge dataSources={dataSources} activeCount={activeCount} />
      )}
    </>
  );
}
