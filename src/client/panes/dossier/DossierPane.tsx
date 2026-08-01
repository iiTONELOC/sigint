import { useCallback } from "react";
import { Domain } from "@shared/domain/identity";
import { IsolateMode } from "@/workers/render/protocol";
import { Plane } from "lucide-react";
import { useData } from "@/context/DataContext";
import { filterHeadingColor, useTheme } from "@/theme";
import { useUnitsMode } from "@/preferences/units";
import { zoomToThenClear } from "@/selection";
import { AircraftDossier } from "@/features/tracking/aircraft/ui/AircraftDossier";
import { NonAircraftDossier } from "./NonAircraftDossier";

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
    const next = isolateMode === IsolateMode.Focus ? null : IsolateMode.Focus;
    setIsolateMode(next);
  }, [isolateMode, setIsolateMode]);

  const handleSolo = useCallback(() => {
    const next = isolateMode === IsolateMode.Solo ? null : IsolateMode.Solo;
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
    selectedCurrent.type === Domain.Aircraft ? (
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
