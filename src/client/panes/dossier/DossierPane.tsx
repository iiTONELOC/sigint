import { useCallback } from "react";
import { Plane } from "lucide-react";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import { filterHeadingColor } from "@/config/theme";
import { useUnitsMode } from "@/lib/ui/userPreferences";
import { zoomToThenClear } from "@/lib/runtime/revealSignals";
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
  useUnitsMode(); // re-render the dossier body when the units pref flips
  const { theme } = useTheme();

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
      zoomToThenClear(setZoomToId, selectedCurrent.id);
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

  const body =
    selectedCurrent.type === "aircraft" ? (
      <AircraftDossier
        item={selectedCurrent}
        isolateMode={isolateMode}
        onLocate={handleLocate}
        onFocus={handleFocus}
        onSolo={handleSolo}
        onClose={handleClose}
      />
    ) : (
      <NonAircraftDossier
        item={selectedCurrent}
        isolateMode={isolateMode}
        onLocate={handleLocate}
        onFocus={handleFocus}
        onSolo={handleSolo}
        onClose={handleClose}
      />
    );

  return (
    <div
      className="h-full"
      style={
        {
          "--dossier-accent": filterHeadingColor(theme, selectedCurrent.type),
        } as React.CSSProperties
      }
    >
      {body}
    </div>
  );
}
