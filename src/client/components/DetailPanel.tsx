import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import type { DataPoint } from "@/features/base/dataPoints";
import { featureRegistry } from "@/features/registry";
import { mono, FONT_SM, FONT_MD, FONT_LG, FONT_BTN } from "@/components/styles";

function getRows(item: DataPoint): [string, string][] {
  const feature = featureRegistry.get(item.type);
  if (!feature) return [];
  return feature.buildDetailRows((item as any).data, item.timestamp);
}

export type DetailPanelProps = {
  readonly item: DataPoint | null;
  readonly onClose: () => void;
};

export function DetailPanel({ item, onClose }: DetailPanelProps) {
  const { theme } = useTheme();
  const C = theme.colors;
  const colorMap = getColorMap(theme);

  if (!item) return null;

  const feature = featureRegistry.get(item.type);
  if (!feature) return null;

  const Icon = feature.icon;
  const color = colorMap[item.type];
  const rows = getRows(item);

  return (
    <>
      {/* Mobile: bottom sheet */}
      <div
        className="fixed inset-x-0 bottom-0 rounded-t-lg backdrop-blur-sm z-30 md:hidden max-h-[60vh] overflow-y-auto"
        style={{
          background: `${C.panel}f5`,
          border: `1px solid ${C.border}`,
          borderBottom: "none",
          padding: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <PanelContent
          Icon={Icon}
          color={color}
          feature={feature}
          item={item}
          rows={rows}
          C={C}
          onClose={onClose}
        />
      </div>

      {/* Desktop: floating card */}
      <div
        className="hidden md:block absolute right-3.5 top-3.5 w-64 rounded-md backdrop-blur-sm z-30"
        style={{
          background: `${C.panel}f0`,
          border: `1px solid ${C.border}`,
          padding: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <PanelContent
          Icon={Icon}
          color={color}
          feature={feature}
          item={item}
          rows={rows}
          C={C}
          onClose={onClose}
        />
      </div>
    </>
  );
}

function PanelContent({
  Icon,
  color,
  feature,
  item,
  rows,
  C,
  onClose,
}: {
  Icon: any;
  color: string | undefined;
  feature: any;
  item: DataPoint;
  rows: [string, string][];
  C: any;
  onClose: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex items-center gap-1.5">
          <Icon
            size="clamp(14px, 2vw, 18px)"
            style={{ color: color ?? C.text }}
            {...(item.type === "aircraft" || item.type === "events"
              ? { fill: "currentColor", strokeWidth: 0 }
              : { strokeWidth: 2.5 })}
          />
          <span
            className="font-bold tracking-widest"
            style={mono(color ?? C.text, FONT_BTN)}
          >
            {feature.label}
          </span>
        </div>
        <span
          onClick={onClose}
          className="cursor-pointer text-[15px] leading-none select-none"
          style={{ color: C.dim }}
        >
          ✕
        </span>
      </div>

      {/* Rows */}
      <div className="pt-2.5" style={{ borderTop: `1px solid ${C.border}` }}>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between mb-1.5">
            <span
              className="uppercase tracking-wide"
              style={mono(C.dim, FONT_SM)}
            >
              {k}
            </span>
            <span
              className="text-right max-w-38.75 wrap-break-word"
              style={mono(C.bright, FONT_LG)}
            >
              {v}
            </span>
          </div>
        ))}
      </div>

      {/* Coordinates */}
      <div
        className="mt-1.5 pt-1.5"
        style={{
          borderTop: `1px solid ${C.border}`,
          ...mono(C.dim, FONT_MD),
        }}
      >
        {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
        {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
      </div>
    </>
  );
}
