import { useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import { featureList } from "@/features/registry";

type LayerLegendProps = {
  readonly layers: Record<string, boolean>;
  readonly counts: Record<string, number>;
  readonly onToggle?: (key: string) => void;
};

export function LayerLegend({
  layers,
  counts,
  onToggle,
}: Readonly<LayerLegendProps>) {
  const { theme } = useTheme();
  const colorMap = useMemo(() => getColorMap(theme), [theme]);

  return (
    <div className="absolute left-2 md:left-3 bottom-2 md:bottom-3 z-10 flex flex-row md:flex-col gap-1">
      {featureList.map((f) => {
        const enabled = layers[f.id] !== false;
        const Icon = f.icon;
        const color = colorMap[f.id];
        return (
          <button
            key={f.id}
            onClick={() => onToggle?.(f.id)}
            className="flex items-center gap-1 md:gap-1.5 px-1.5 md:px-2 py-0.5 rounded bg-sig-panel/75 text-(length:--sig-text-btn) border-none transition-opacity cursor-pointer hover:bg-sig-panel"
            style={{
              borderLeft: `2px solid ${enabled ? color : color + "40"}`,
              color: enabled ? color : color + "50",
              opacity: enabled ? 1 : 0.5,
            }}
            title={`${enabled ? "Hide" : "Show"} ${f.label}`}
          >
            <Icon
              size="1em"
              {...(f.id === "aircraft" || f.id === "events"
                ? { fill: "currentColor", strokeWidth: 0 }
                : { strokeWidth: 2.5 })}
            />
            <span className="tracking-wide hidden sm:inline text-sig-dim text-(length:--sig-text-md) flex-1 text-left">
              {f.label}
            </span>
            <span className="font-bold tabular-nums min-w-[3ch] text-right">
              {counts[f.id] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
