import type { ModelTrack } from "@shared/domain/cyclones";
import { modelColor, modelLabel } from "../classification";
import { useDataContext } from "@/context/DataContext";
import { ButtonType } from "@/lib/ui/button";

export function CycloneModelLegend({
  entityId,
  models,
  hiddenModels,
}: Readonly<{
  entityId: string;
  models: readonly ModelTrack[];
  hiddenModels: readonly string[];
}>) {
  const { toggleModel, toggleAllModels } = useDataContext();
  if (models.length === 0) return null;
  const codes = models.map((model) => model.model);
  const anyVisible = codes.some((code) => !hiddenModels.includes(code));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-(length:--sig-text-xs) text-sig-text">
      {models.map((model) => {
        const hidden = hiddenModels.includes(model.model);
        return (
          <button
            key={model.model}
            type={ButtonType.Button}
            onClick={() => toggleModel(entityId, model.model)}
            aria-pressed={!hidden}
            className={`flex items-center gap-1.5 min-w-0 min-h-9 cursor-pointer transition-opacity ${
              hidden ? "opacity-40" : "opacity-100"
            }`}
          >
            <span
              className="w-3 h-0.75 rounded-full shrink-0"
              style={{ backgroundColor: modelColor(model.model) }}
            />
            <span className={`truncate ${hidden ? "line-through" : ""}`}>
              {modelLabel(model.model)}
            </span>
          </button>
        );
      })}
      <button
        type={ButtonType.Button}
        onClick={() => toggleAllModels(entityId, codes)}
        className="min-h-9 px-1.5 cursor-pointer tracking-wide text-(--dossier-accent) font-semibold"
      >
        {anyVisible ? "HIDE ALL" : "SHOW ALL"}
      </button>
    </div>
  );
}
