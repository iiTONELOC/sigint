// ── CycloneLayerToggles ──────────────────────────────────────────────
// Show/hide toggles for the cyclone render layers (forecast track, cone,
// watch/warning areas). Reuses the dossier IsoBtn so the styling and
// aria-pressed toggle semantics match LOCATE/FOCUS/SOLO exactly, and reads
// the live cyclone filter + setter from DataContext (the flags are real
// state there, not hardcoded). Rendered in both the cyclone dossier and the
// detail-panel cyclone block.

import { Spline, Circle, TriangleAlert } from "lucide-react";
import { useData } from "@/context/DataContext";
import { IsoBtn } from "@/panes/dossier/DossierAtoms";

const LAYERS = [
  { key: "showForecast", label: "TRACK", icon: Spline },
  { key: "showCone", label: "CONE", icon: Circle },
  { key: "showWarnings", label: "WARNINGS", icon: TriangleAlert },
] as const;

export function CycloneLayerToggles() {
  const { cycloneFilter, toggleCycloneLayer } = useData();

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Cyclone layers">
      {LAYERS.map(({ key, label, icon }) => (
        <IsoBtn
          key={key}
          toggle
          active={cycloneFilter[key]}
          label={label}
          icon={icon}
          ariaLabel={`Toggle ${label.toLowerCase()} layer`}
          onClick={() => toggleCycloneLayer(key)}
        />
      ))}
    </div>
  );
}
