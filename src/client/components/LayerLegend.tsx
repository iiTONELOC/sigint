import { useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import { featureList } from "@/features/registry";
import { mono, FONT_MD, FONT_BTN } from "./styles";

interface LayerLegendProps {
  readonly layers: Record<string, boolean>;
  readonly counts: Record<string, number>;
}

export function LayerLegend({ layers, counts }: Readonly<LayerLegendProps>) {
  const { theme } = useTheme();
  const C = theme.colors;
  const colorMap = useMemo(() => getColorMap(theme), [theme]);

  return (
    <div className="absolute left-2 md:left-3 bottom-2 md:bottom-3 z-10 flex flex-row md:flex-col gap-1">
      {featureList.map((f) => {
        if (layers[f.id] === false) return null;
        const Icon = f.icon;
        const color = colorMap[f.id] ?? C.dim;
        return (
          <div
            key={f.id}
            className="flex items-center gap-1 md:gap-1.5 px-1.5 md:px-2 py-0.5 rounded"
            style={{
              background: `${C.panel}bb`,
              borderLeft: `2px solid ${color}`,
            }}
          >
            <span style={{ color, ...mono(color, FONT_BTN) }}>
              <Icon
                size="1em"
                {...(f.id === "aircraft" || f.id === "events"
                  ? { fill: "currentColor", strokeWidth: 0 }
                  : { strokeWidth: 2.5 })}
              />
            </span>
            <span
              className="tracking-wide hidden sm:inline"
              style={mono(C.dim, FONT_MD)}
            >
              {f.label}
            </span>
            <span className="font-bold" style={mono(color, FONT_BTN)}>
              {counts[f.id] ?? 0}
            </span>
          </div>
        );
      })}
    </div>
  );
}
