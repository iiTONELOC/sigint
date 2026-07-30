// ── CycloneLayerToggles ──────────────────────────────────────────────
// Show/hide toggles for the cyclone render layers (forecast track, cone, wind
// field, watch/warning areas). Cyclone-local toggle button so the active state
// rides the category accent (--dossier-accent / windColor) instead of the shared
// theme-cyan IsoBtn. Reads the live cyclone filter + setter from DataContext.

import { Spline, Circle, Target, GitBranch, TriangleAlert, type LucideIcon } from "lucide-react";
import { useData } from "@/context/DataContext";

const LAYERS = [
  { key: "showForecast", label: "TRACK", icon: Spline },
  { key: "showCone", label: "CONE", icon: Circle },
  { key: "showWindField", label: "WIND FIELD", icon: Target },
  { key: "showModels", label: "MODELS", icon: GitBranch },
  { key: "showWarnings", label: "WARNINGS", icon: TriangleAlert },
] as const;

function ToggleBtn({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Toggle ${label.toLowerCase()} layer`}
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-1 px-1.5 py-1 rounded text-(length:--sig-text-xs) font-mono tracking-wider transition-colors border shrink-0 ${
        active
          ? "text-(--dossier-accent) bg-(--dossier-accent)/15 border-(--dossier-accent)/40"
          : "text-sig-dim bg-transparent border-sig-border hover:text-sig-bright hover:border-sig-grid/40"
      }`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {label}
    </button>
  );
}

export function CycloneLayerToggles() {
  const { cycloneFilter, toggleCycloneLayer } = useData();

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Cyclone layers">
      {LAYERS.map(({ key, label, icon }) => (
        <ToggleBtn
          key={key}
          active={cycloneFilter[key]}
          label={label}
          icon={icon}
          onClick={() => toggleCycloneLayer(key)}
        />
      ))}
    </div>
  );
}
