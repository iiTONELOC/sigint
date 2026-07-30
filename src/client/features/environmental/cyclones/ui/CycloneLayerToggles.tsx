// ── CycloneLayerToggles ──────────────────────────────────────────────
// Show/hide toggles for the cyclone render layers (forecast track, cone, wind
// field, watch/warning areas). Cyclone-local toggle button so the active state
// rides the category accent (--dossier-accent / windColor) instead of the shared
// theme-cyan IsoBtn. Reads the live cyclone filter + setter from DataContext.

import { Spline, Circle, Target, GitBranch, TriangleAlert, type LucideIcon } from "lucide-react";
import { useData } from "@/context/DataContext";
import { RenderCycloneLayer } from "@/workers/render/protocol";

type CycloneLayerToggle = Readonly<{
  key: RenderCycloneLayer;
  label: string;
  icon: LucideIcon;
}>;

const LAYERS: readonly CycloneLayerToggle[] = [
  {
    key: RenderCycloneLayer.Forecast,
    label: "TRACK",
    icon: Spline,
  },
  {
    key: RenderCycloneLayer.Cone,
    label: "CONE",
    icon: Circle,
  },
  {
    key: RenderCycloneLayer.WindField,
    label: "WIND FIELD",
    icon: Target,
  },
  {
    key: RenderCycloneLayer.Models,
    label: "MODELS",
    icon: GitBranch,
  },
  {
    key: RenderCycloneLayer.Warnings,
    label: "WARNINGS",
    icon: TriangleAlert,
  },
];

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
    <fieldset className="flex flex-wrap gap-1">
      <legend className="sr-only">Cyclone layers</legend>
      {LAYERS.map(({ key, label, icon }) => (
        <ToggleBtn
          key={key}
          active={cycloneFilter[key]}
          label={label}
          icon={icon}
          onClick={() => toggleCycloneLayer(key)}
        />
      ))}
    </fieldset>
  );
}
