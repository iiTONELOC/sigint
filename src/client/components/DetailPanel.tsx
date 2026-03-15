import { useRef, useState, useCallback } from "react";
import { Eye, EyeOff, Crosshair, GripHorizontal } from "lucide-react";
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
  readonly isolateMode: null | "solo" | "focus";
  readonly onSetIsolateMode: (mode: null | "solo" | "focus") => void;
  readonly onClose: () => void;
};

function useDrag() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragged, setDragged] = useState(false);
  const dragState = useRef({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
      };
    },
    [pos],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos({
      x: dragState.current.origX + dx,
      y: dragState.current.origY + dy,
    });
    setDragged(true);
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current.active = false;
  }, []);

  const reset = useCallback(() => {
    setPos({ x: 0, y: 0 });
    setDragged(false);
  }, []);

  return { pos, dragged, onPointerDown, onPointerMove, onPointerUp, reset };
}

export function DetailPanel({
  item,
  isolateMode,
  onSetIsolateMode,
  onClose,
}: DetailPanelProps) {
  const { theme } = useTheme();
  const C = theme.colors;
  const colorMap = getColorMap(theme);
  const drag = useDrag();

  // Reset drag position when selecting a new item
  const lastItemId = useRef<string | null>(null);
  if (item?.id !== lastItemId.current) {
    lastItemId.current = item?.id ?? null;
    if (drag.dragged) drag.reset();
  }

  if (!item) return null;

  const feature = featureRegistry.get(item.type);
  if (!feature) return null;

  const Icon = feature.icon;
  const color = colorMap[item.type];
  const rows = getRows(item);

  const content = (
    <PanelContent
      Icon={Icon}
      color={color}
      feature={feature}
      item={item}
      rows={rows}
      C={C}
      isolateMode={isolateMode}
      onSetIsolateMode={onSetIsolateMode}
      onClose={onClose}
    />
  );

  return (
    <>
      {/* Mobile: bottom sheet */}
      <div
        className="fixed inset-x-0 bottom-0 rounded-t-lg backdrop-blur-sm z-40 md:hidden max-h-[60vh] overflow-y-auto"
        style={{
          background: `${C.panel}f5`,
          border: `1px solid ${C.border}`,
          borderBottom: "none",
          padding: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>

      {/* Desktop: draggable floating card */}
      <div
        className="hidden md:block absolute w-72 rounded-md backdrop-blur-sm z-40"
        style={{
          top: 14,
          right: 14,
          transform: `translate(${drag.pos.x}px, ${drag.pos.y}px)`,
          background: `${C.panel}f0`,
          border: `1px solid ${C.border}`,
          padding: 14,
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center mb-1 cursor-grab active:cursor-grabbing"
          style={{ color: C.dim, marginTop: -4 }}
          onPointerDown={drag.onPointerDown}
        >
          <GripHorizontal size={14} />
        </div>
        {content}
      </div>
    </>
  );
}

function ModeButton({
  active,
  label,
  icon: ButtonIcon,
  accentColor,
  dimColor,
  brightColor,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: any;
  accentColor: string;
  dimColor: string;
  brightColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-all"
      style={{
        ...mono(active ? accentColor : dimColor, "10px"),
        background: active ? `${accentColor}20` : "transparent",
        border: `1px solid ${active ? accentColor : `${brightColor}30`}`,
        cursor: "pointer",
        letterSpacing: 1,
        fontFamily: "inherit",
      }}
    >
      <ButtonIcon size={11} />
      {label}
    </button>
  );
}

function PanelContent({
  Icon,
  color,
  feature,
  item,
  rows,
  C,
  isolateMode,
  onSetIsolateMode,
  onClose,
}: {
  Icon: any;
  color: string | undefined;
  feature: any;
  item: DataPoint;
  rows: [string, string][];
  C: any;
  isolateMode: null | "solo" | "focus";
  onSetIsolateMode: (mode: null | "solo" | "focus") => void;
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
        <div className="flex items-center gap-1">
          <ModeButton
            active={isolateMode === "focus"}
            label="FOCUS"
            icon={Eye}
            accentColor={C.accent}
            dimColor={C.dim}
            brightColor={C.bright}
            onClick={() =>
              onSetIsolateMode(isolateMode === "focus" ? null : "focus")
            }
          />
          <ModeButton
            active={isolateMode === "solo"}
            label="SOLO"
            icon={Crosshair}
            accentColor={C.danger}
            dimColor={C.dim}
            brightColor={C.bright}
            onClick={() =>
              onSetIsolateMode(isolateMode === "solo" ? null : "solo")
            }
          />
          <span
            onClick={onClose}
            className="cursor-pointer text-[15px] leading-none select-none ml-1"
            style={{ color: C.dim }}
          >
            ✕
          </span>
        </div>
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
