import type { ModelTrack } from "../types";
import { modelColor } from "../classification";
import { useData } from "@/context/DataContext";

// TV-style spaghetti legend: one chip per guidance model, color-matched to its
// track on the map. Shown only when MODELS is on and tracks are present.

// Friendly names for the common guidance models; falls back to the raw code.
const MODEL_LABEL: Record<string, string> = {
  OFCL: "NHC Official",
  TVCN: "Consensus",
  AVNO: "GFS",
  GFSO: "GFS",
  EMXI: "ECMWF",
  EMX: "ECMWF",
  CMC: "Canadian",
  CMCI: "Canadian",
  UKM: "UKMET",
  UKMI: "UKMET",
  HWRF: "HWRF",
  HWFI: "HWRF",
  HMON: "HMON",
  HMNI: "HMON",
  NVGM: "Navy NAVGEM",
  AEMN: "GEFS Mean",
};

export function CycloneModelLegend({ models }: { readonly models: ModelTrack[] }) {
  const { hiddenModels, toggleModel, toggleAllModels } = useData();
  if (models.length === 0) return null;
  const codes = models.map((m) => m.model);
  const anyVisible = codes.some((c) => !hiddenModels.has(c));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-(length:--sig-text-xs) text-sig-text">
      {models.map((m) => {
        const hidden = hiddenModels.has(m.model);
        return (
          <button
            key={m.model}
            type="button"
            onClick={() => toggleModel(m.model)}
            aria-pressed={!hidden}
            className={`flex items-center gap-1.5 min-w-0 min-h-9 cursor-pointer transition-opacity ${
              hidden ? "opacity-40" : "opacity-100"
            }`}
          >
            <span
              className="w-3 h-[3px] rounded-full shrink-0"
              style={{ backgroundColor: modelColor(m.model) }}
            />
            <span className={`truncate ${hidden ? "line-through" : ""}`}>
              {MODEL_LABEL[m.model] ?? m.model}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => toggleAllModels(codes)}
        className="min-h-9 px-1.5 cursor-pointer tracking-wide text-(--dossier-accent) font-semibold"
      >
        {anyVisible ? "HIDE ALL" : "SHOW ALL"}
      </button>
    </div>
  );
}
