import { useRef, useState, useCallback } from "react";
import { Eye, Crosshair, GripHorizontal, ExternalLink } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import type { DataPoint } from "@/features/base/dataPoints";
import { featureRegistry } from "@/features/registry";

function isUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

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
  readonly side?: "left" | "right";
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
  side = "right",
}: DetailPanelProps) {
  const { theme } = useTheme();
  const C = theme.colors;
  const colorMap = getColorMap(theme);
  const drag = useDrag();

  const lastItemId = useRef<string | null>(null);
  const lastSide = useRef(side);
  if (item?.id !== lastItemId.current || side !== lastSide.current) {
    lastItemId.current = item?.id ?? null;
    lastSide.current = side;
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
      isolateMode={isolateMode}
      onSetIsolateMode={onSetIsolateMode}
      onClose={onClose}
    />
  );

  return (
    <>
      {/* Mobile: compact bottom sheet */}
      <div
        className="fixed inset-x-0 bottom-0 rounded-t-lg backdrop-blur-sm z-40 md:hidden max-h-[28vh] overflow-y-auto sigint-scroll bg-sig-panel/96 border border-sig-border border-b-0 px-2.5 pb-2 pt-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-1">
          <div className="w-8 h-0.5 rounded-full bg-sig-dim/40" />
        </div>
        {content}
      </div>

      {/* Desktop: draggable floating card */}
      <div
        className={`hidden md:block absolute w-72 rounded-md backdrop-blur-sm z-40 bg-sig-panel/94 border border-sig-border p-3.5 top-3.5 ${side === "left" ? "left-3.5" : "right-3.5"}`}
        style={{ transform: `translate(${drag.pos.x}px, ${drag.pos.y}px)` }}
        onClick={(e) => e.stopPropagation()}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
      >
        <div
          className="flex justify-center mb-1 -mt-1 text-sig-dim cursor-grab active:cursor-grabbing"
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
  onClick,
}: {
  active: boolean;
  label: string;
  icon: any;
  accentColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all text-[10px] tracking-wide ${
        active ? "border" : "text-sig-dim border border-sig-bright/20"
      }`}
      style={
        active
          ? {
              color: accentColor,
              background: `${accentColor}20`,
              borderColor: accentColor,
            }
          : undefined
      }
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
  isolateMode,
  onSetIsolateMode,
  onClose,
}: {
  Icon: any;
  color: string | undefined;
  feature: any;
  item: DataPoint;
  rows: [string, string][];
  isolateMode: null | "solo" | "focus";
  onSetIsolateMode: (mode: null | "solo" | "focus") => void;
  onClose: () => void;
}) {
  const dataRows = rows.filter(([, v]) => !isUrl(v));
  const linkRows = rows.filter(([, v]) => isUrl(v));

  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex items-center gap-1.5">
          <Icon
            size="clamp(14px, 2vw, 18px)"
            style={{ color }}
            {...(item.type === "aircraft" || item.type === "events"
              ? { fill: "currentColor", strokeWidth: 0 }
              : { strokeWidth: 2.5 })}
          />
          <span
            className="font-bold tracking-widest text-(length:--sig-text-btn)"
            style={{ color }}
          >
            {feature.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ModeButton
            active={isolateMode === "focus"}
            label="FOCUS"
            icon={Eye}
            accentColor="var(--sigint-accent)"
            onClick={() =>
              onSetIsolateMode(isolateMode === "focus" ? null : "focus")
            }
          />
          <ModeButton
            active={isolateMode === "solo"}
            label="SOLO"
            icon={Crosshair}
            accentColor="var(--sigint-danger)"
            onClick={() =>
              onSetIsolateMode(isolateMode === "solo" ? null : "solo")
            }
          />
          <span
            onClick={onClose}
            className="cursor-pointer text-[15px] leading-none select-none ml-1 text-sig-dim"
          >
            ✕
          </span>
        </div>
      </div>

      {/* Data rows */}
      <div className="pt-2.5 border-t border-sig-border">
        {dataRows.map(([k, v]) => (
          <div key={k} className="flex justify-between mb-1.5">
            <span className="uppercase tracking-wide text-sig-dim text-(length:--sig-text-sm)">
              {k}
            </span>
            <span className="text-right max-w-38.75 wrap-break-word text-sig-bright text-(length:--sig-text-lg)">
              {v}
            </span>
          </div>
        ))}
      </div>

      {/* Coordinates */}
      <div className="mt-1.5 pt-1.5 border-t border-sig-border text-sig-dim text-(length:--sig-text-md)">
        {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
        {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
      </div>

      {/* Intel links */}
      {linkRows.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-sig-border flex flex-wrap gap-1">
          {linkRows.map(([label, url]) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-accent text-(length:--sig-text-sm) tracking-wide border border-sig-accent/30 bg-sig-accent/5 transition-all hover:bg-sig-accent/15"
            >
              {label}
              <ExternalLink size={9} />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
