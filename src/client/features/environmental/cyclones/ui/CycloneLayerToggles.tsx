import {
  Circle, Clock, GitBranch, Percent, Radar, Satellite, Spline, Target, TriangleAlert, Waves, type LucideIcon,
} from "lucide-react";
import { useDataContext } from "@/context/DataContext";
import {
  DossierToggleButton,
  DossierToggleTone,
} from "@/dossier";
import {
  RenderCycloneLayer,
  type RenderCycloneOverlay,
} from "@/workers/render/protocol";

type CycloneLayerToggle = Readonly<{
  label: string;
  icon: LucideIcon;
}>;

const LAYERS: Readonly<Record<RenderCycloneLayer, CycloneLayerToggle>> = {
  [RenderCycloneLayer.Forecast]: { label: "TRACK", icon: Spline },
  [RenderCycloneLayer.Cone]: { label: "CONE", icon: Circle },
  [RenderCycloneLayer.WindField]: { label: "WIND FIELD", icon: Target },
  [RenderCycloneLayer.Models]: { label: "MODELS", icon: GitBranch },
  [RenderCycloneLayer.Satellite]: { label: "SAT IR", icon: Satellite },
  [RenderCycloneLayer.Radar]: { label: "RADAR", icon: Radar },
  [RenderCycloneLayer.WindChances]: { label: "WIND PROBS", icon: Percent },
  [RenderCycloneLayer.Arrival]: { label: "ARRIVAL", icon: Clock },
  [RenderCycloneLayer.Surge]: { label: "SURGE", icon: Waves },
};

export function CycloneLayerToggles({
  entityId,
  overlay,
}: Readonly<{
  entityId: string;
  overlay: RenderCycloneOverlay;
}>) {
  const {
    cycloneWarningsVisible,
    toggleCycloneLayer,
    toggleCycloneWarnings,
  } = useDataContext();

  return (
    <div className="@container/toggles">
    <fieldset className="grid grid-cols-2 @min-[34.125rem]/toggles:grid-cols-5 gap-1">
      <legend className="sr-only">Cyclone layers</legend>
      {Object.values(RenderCycloneLayer).map((layer) => {
        const { label, icon } = LAYERS[layer];
        return (
          <DossierToggleButton
            key={layer}
            active={overlay[layer]}
            label={label}
            icon={icon}
            ariaLabel={`Toggle ${label.toLowerCase()} layer for this storm`}
            onClick={() => toggleCycloneLayer(entityId, layer)}
            toggle
            tone={DossierToggleTone.DossierAccent}
          />
        );
      })}
      <DossierToggleButton
        active={cycloneWarningsVisible}
        label="WARNINGS"
        icon={TriangleAlert}
        ariaLabel="Toggle global warnings layer"
        onClick={toggleCycloneWarnings}
        toggle
        tone={DossierToggleTone.DossierAccent}
      />
    </fieldset>
    </div>
  );
}
