import { useRef, useState, useCallback } from "react";
import {
  Eye,
  Crosshair,
  GripHorizontal,
  ExternalLink,
  FileSearch,
  LocateFixed,
} from "lucide-react";
import { useHasDossier } from "@/panes/paneLayoutContext";
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
  readonly onZoomTo?: () => void;
  readonly onClose: () => void;
  readonly side?: "left" | "right";
  readonly onOpenDossier?: () => void;
};

// ── Desktop drag (free movement) ─────────────────────────────────────

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

// ── Mobile bottom-sheet swipe-to-dismiss ─────────────────────────────

function useSheetDismiss(onClose: () => void) {
  const offsetRef = useRef(0);
  const settlingRef = useRef(false);
  const [, forceRender] = useState(0);
  const dragRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0,
  });
  const sheetRef = useRef<HTMLDivElement>(null);

  const update = useCallback((offset: number, settling: boolean) => {
    offsetRef.current = offset;
    settlingRef.current = settling;
    forceRender((n) => n + 1);
  }, []);

  // Reset — safe to call during render because it only triggers update when needed
  const reset = useCallback(() => {
    dragRef.current = {
      active: false,
      startY: 0,
      lastY: 0,
      lastT: 0,
      velocity: 0,
    };
    if (offsetRef.current !== 0 || settlingRef.current) {
      offsetRef.current = 0;
      settlingRef.current = false;
      forceRender((n) => n + 1);
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const sheet = sheetRef.current;
    if (sheet && sheet.scrollTop > 0) return;
    const touch = e.touches[0];
    if (!touch) return;
    dragRef.current = {
      active: true,
      startY: touch.clientY,
      lastY: touch.clientY,
      lastT: Date.now(),
      velocity: 0,
    };
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragRef.current.active) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dy = touch.clientY - dragRef.current.startY;
      if (dy < 0) {
        if (offsetRef.current !== 0) update(0, false);
        return;
      }
      const now = Date.now();
      const dt = now - dragRef.current.lastT;
      if (dt > 0) {
        dragRef.current.velocity = (touch.clientY - dragRef.current.lastY) / dt;
      }
      dragRef.current.lastY = touch.clientY;
      dragRef.current.lastT = now;
      update(dy, false);
    },
    [update],
  );

  const onTouchEnd = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const vel = dragRef.current.velocity;
    const offset = offsetRef.current;
    if (offset > 80 || vel > 0.5) {
      update(400, true);
      setTimeout(onClose, 200);
    } else {
      update(0, true);
      setTimeout(() => {
        settlingRef.current = false;
        forceRender((n) => n + 1);
      }, 200);
    }
  }, [onClose, update]);

  return {
    sheetRef,
    get offsetY() {
      return offsetRef.current;
    },
    get settling() {
      return settlingRef.current;
    },
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    reset,
  };
}

export function DetailPanel({
  item,
  isolateMode,
  onSetIsolateMode,
  onZoomTo,
  onClose,
  side = "right",
  onOpenDossier,
}: DetailPanelProps) {
  const { theme } = useTheme();
  const hasDossier = useHasDossier();
  const C = theme.colors;
  const colorMap = getColorMap(theme);
  const drag = useDrag();
  const sheet = useSheetDismiss(onClose);

  const lastItemId = useRef<string | null>(null);
  const lastSide = useRef(side);
  if (item?.id !== lastItemId.current || side !== lastSide.current) {
    lastItemId.current = item?.id ?? null;
    lastSide.current = side;
    if (drag.dragged) drag.reset();
    sheet.reset();
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
      onZoomTo={onZoomTo}
      onClose={onClose}
      onOpenDossier={!hasDossier ? onOpenDossier : undefined}
    />
  );

  return (
    <>
      {/* Mobile: swipe-to-dismiss bottom sheet */}
      <div
        ref={sheet.sheetRef}
        className="fixed inset-x-0 bottom-0 rounded-t-lg backdrop-blur-sm z-40 md:hidden max-h-[40vh] overflow-y-auto sigint-scroll bg-sig-panel/96 border border-sig-border border-b-0 px-2.5 pb-3 pt-0"
        style={{
          transform: `translateY(${sheet.offsetY}px)`,
          transition: sheet.settling ? "transform 200ms ease-out" : "none",
          willChange: "transform",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={sheet.onTouchStart}
        onTouchMove={sheet.onTouchMove}
        onTouchEnd={sheet.onTouchEnd}
      >
        {/* Drag handle — wider touch target */}
        <div className="flex justify-center py-2.5 -mx-2.5 cursor-grab touch-none">
          <div className="w-10 h-1 rounded-full bg-sig-dim/50" />
        </div>
        {content}
      </div>

      {/* Desktop: draggable floating card */}
      <div
        className={`hidden md:block absolute w-72 rounded-md backdrop-blur-sm z-40 bg-sig-panel/94 border border-sig-border p-3.5 top-3.5 max-h-[calc(100%-28px)] overflow-y-auto sigint-scroll ${side === "left" ? "left-3.5" : "right-3.5"}`}
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
      className={`flex items-center gap-1 px-2 py-1 rounded transition-all text-[10px] tracking-wide min-h-9 ${
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
  onZoomTo,
  onClose,
  onOpenDossier,
}: {
  Icon: any;
  color: string | undefined;
  feature: any;
  item: DataPoint;
  rows: [string, string][];
  isolateMode: null | "solo" | "focus";
  onSetIsolateMode: (mode: null | "solo" | "focus") => void;
  onZoomTo?: () => void;
  onClose: () => void;
  onOpenDossier?: () => void;
}) {
  const dataRows = rows.filter(([, v]) => !isUrl(v));
  const linkRows = rows.filter(([, v]) => isUrl(v));

  return (
    <>
      {/* Header */}
      <div className="mb-2.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Icon
              size="clamp(14px, 2vw, 18px)"
              style={{ color }}
              {...feature.iconProps}
            />
            <span
              className="font-bold tracking-widest text-(length:--sig-text-btn)"
              style={{ color }}
            >
              {feature.label}
            </span>
          </div>
          <span
            onClick={onClose}
            className="cursor-pointer text-[18px] leading-none select-none text-sig-dim min-w-8 min-h-8 flex items-center justify-center hover:text-sig-bright transition-colors"
          >
            ✕
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onZoomTo && (
            <ModeButton
              active={false}
              label="LOCATE"
              icon={LocateFixed}
              accentColor="var(--sigint-accent)"
              onClick={onZoomTo}
            />
          )}
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

      {/* Open in Dossier button — shown when no dossier pane is open */}
      {onOpenDossier && (
        <div className="mt-1.5 pt-1.5 border-t border-sig-border">
          <button
            onClick={onOpenDossier}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-sig-accent text-(length:--sig-text-sm) tracking-wider font-semibold border border-sig-accent/30 bg-sig-accent/5 transition-all hover:bg-sig-accent/15"
          >
            <FileSearch size={12} strokeWidth={2.5} />
            OPEN IN DOSSIER
          </button>
        </div>
      )}

      {/* Intel links — always visible */}
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
