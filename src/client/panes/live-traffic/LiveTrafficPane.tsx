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
    searchMatchIds,
    counts,
    activeCount,
    dataSources,
  } = useData();

  const [panelSide, setPanelSide] = useState<"left" | "right">("right");

  const handleSelect = useCallback(
    (item: DataPoint | null) => {
      if (!item) return;
      if (chromeHidden) setChromeHidden(false);
      setSelected(item);
    },
    [chromeHidden, setChromeHidden, setSelected],
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
      />
      {!chromeHidden && (
        <DetailPanel
          item={selectedCurrent}
          onClose={handleClose}
          isolateMode={isolateMode}
          onSetIsolateMode={setIsolateMode}
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
