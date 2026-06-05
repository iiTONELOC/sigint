import { useCallback } from "react";
import { Plane } from "lucide-react";
import { useData } from "@/context/DataContext";
import { AircraftDossier } from "@/features/tracking/aircraft/ui/AircraftDossier";
import { NonAircraftDossier } from "./NonAircraftDossier";

// DossierPane is a thin dispatcher (cyclones plan, step 11). Per-feature
// dossier bodies live in features/{feature}/ui/{Feature}Dossier.tsx;
// this file picks one based on the selected DataPoint type.

export function DossierPane() {
  const {
    selectedCurrent,
    setSelected,
    isolateMode,
    setIsolateMode,
    setZoomToId,
  } = useData();

  const handleClose = useCallback(() => {
    setSelected(null);
    setIsolateMode(null);
  }, [setSelected, setIsolateMode]);

  const handleFocus = useCallback(() => {
    const next = isolateMode === "focus" ? null : "focus";
    setIsolateMode(next);
  }, [isolateMode, setIsolateMode]);

  const handleSolo = useCallback(() => {
    const next = isolateMode === "solo" ? null : "solo";
    setIsolateMode(next);
  }, [isolateMode, setIsolateMode]);

  const handleLocate = useCallback(() => {
    if (selectedCurrent) {
      setZoomToId(selectedCurrent.id);
      setTimeout(() => setZoomToId(null), 100);
    }
  }, [setZoomToId, selectedCurrent]);

  if (!selectedCurrent) {
    return (
      <div className="h-full flex items-center justify-center text-sig-dim">
        <div className="text-center">
          <Plane className="w-8 h-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
          <p>Select a track to view dossier</p>
        </div>
      </div>
    );
  }

  if (selectedCurrent.type === "aircraft") {
    return (
      <AircraftDossier
        item={selectedCurrent}
        isolateMode={isolateMode}
        onLocate={handleLocate}
        onFocus={handleFocus}
        onSolo={handleSolo}
        onClose={handleClose}
      />
    );
  }

  return (
    <NonAircraftDossier
      item={selectedCurrent}
      isolateMode={isolateMode}
      onLocate={handleLocate}
      onFocus={handleFocus}
      onSolo={handleSolo}
      onClose={handleClose}
    />
  );
}
