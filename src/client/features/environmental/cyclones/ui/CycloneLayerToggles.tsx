import {
  Circle, GitBranch, Spline, Target, TriangleAlert, type LucideIcon,
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
  [RenderCycloneLayer.Forecast]: {
    label: "TRACK",
    icon: Spline,
  },
  [RenderCycloneLayer.Cone]: {
    label: "CONE",
    icon: Circle,
  },
  [RenderCycloneLayer.WindField]: {
    label: "WIND FIELD",
    icon: Target,
  },
  [RenderCycloneLayer.Models]: {
    label: "MODELS",
    icon: GitBranch,
  },
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
    <fieldset className="flex flex-wrap gap-1">
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
  );
}
