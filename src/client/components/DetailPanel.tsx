import { useRef, useState, useEffect, useCallback } from "react";
import {
  Eye,
  Crosshair,
  GripHorizontal,
  ExternalLink,
  FileSearch,
  LocateFixed,
} from "lucide-react";
import { useHasDossier } from "@/lib/layoutSignals";
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
  const posRef = useRef(pos);
  posRef.current = pos;

  // Window-level move/up so touch drag works reliably
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragState.current.active) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      setPos({
        x: dragState.current.origX + dx,
        y: dragState.current.origY + dy,
      });
      setDragged(true);
    };
    const onUp = () => {
      dragState.current.active = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: posRef.current.x,
      origY: posRef.current.y,
    };
  }, []);

  const reset = useCallback(() => {
    setPos({ x: 0, y: 0 });
    setDragged(false);
  }, []);

  return { pos, dragged, onPointerDown, reset };
}

// ── Mobile bottom-sheet with snap heights ────────────────────────────

const SNAP_HEIGHTS = [18, 38, 55]; // vh: peek, half, full — capped at 55 so globe point stays visible

function useSheetDismiss(onClose: () => void) {
  const offsetRef = useRef(0);
  const settlingRef = useRef(false);
  const [heightVh, setHeightVh] = useState(SNAP_HEIGHTS[1]!);
  const heightRef = useRef(SNAP_HEIGHTS[1]!);
  heightRef.current = heightVh;
  const heightAtDragStart = useRef(SNAP_HEIGHTS[1]!);
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

  const snapTo = useCallback((vh: number) => {
    settlingRef.current = true;
    setHeightVh(vh);
    if (offsetRef.current !== 0) offsetRef.current = 0;
    forceRender((n) => n + 1);
    setTimeout(() => {
      settlingRef.current = false;
      forceRender((n) => n + 1);
    }, 250);
  }, []);

  const reset = useCallback(() => {
    dragRef.current = {
      active: false,
      startY: 0,
      lastY: 0,
      lastT: 0,
      velocity: 0,
    };
    if (heightRef.current !== SNAP_HEIGHTS[1]!) {
      setHeightVh(SNAP_HEIGHTS[1]!);
    }
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
    heightAtDragStart.current = heightRef.current;
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
      const now = Date.now();
      const dt = now - dragRef.current.lastT;
      if (dt > 0) {
        dragRef.current.velocity = (touch.clientY - dragRef.current.lastY) / dt;
      }
      dragRef.current.lastY = touch.clientY;
      dragRef.current.lastT = now;
      const dvh = (dy / window.innerHeight) * 100;
      const newH = Math.max(
        10,
        Math.min(SNAP_HEIGHTS[2]! + 2, heightAtDragStart.current - dvh),
      );
      setHeightVh(newH);
      if (newH <= 10) {
        update(
          Math.max(
            0,
            dy - (heightAtDragStart.current / 100) * window.innerHeight * 0.5,
          ),
          false,
        );
      } else {
        if (offsetRef.current !== 0) update(0, false);
      }
    },
    [update],
  );

  const onTouchEnd = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const vel = dragRef.current.velocity;
    const h = heightRef.current;

    if (vel > 1.2) {
      update(400, true);
      setTimeout(onClose, 200);
      return;
    }
    if (vel < -0.8) {
      const next =
        SNAP_HEIGHTS.find((s) => s > h + 5) ??
        SNAP_HEIGHTS[SNAP_HEIGHTS.length - 1]!;
      snapTo(next);
      return;
    }
    if (h < 12) {
      update(400, true);
      setTimeout(onClose, 200);
      return;
    }

    let best = SNAP_HEIGHTS[0]!;
    let bestDist = Infinity;
    for (const s of SNAP_HEIGHTS) {
      const d = Math.abs(s - h);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    snapTo(best);
  }, [onClose, update, snapTo]);

  return {
    sheetRef,
    heightVh,
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

  // LOCATE button stays highlighted until the selected item changes
  const [locateActive, setLocateActive] = useState(false);
  const handleLocate = useCallback(() => {
    onZoomTo?.();
    setLocateActive(true);
  }, [onZoomTo]);

  const lastItemId = useRef<string | null>(null);
  const lastSide = useRef(side);
  if (item?.id !== lastItemId.current || side !== lastSide.current) {
    lastItemId.current = item?.id ?? null;
    lastSide.current = side;
    if (drag.dragged) drag.reset();
    sheet.reset();
    if (locateActive) setLocateActive(false);
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
      onZoomTo={handleLocate}
      locateActive={locateActive}
      onClose={onClose}
      onOpenDossier={!hasDossier ? onOpenDossier : undefined}
    />
  );

  return (
    <>
      {/* Mobile: bottom sheet — pointer-events-none wrapper lets touches pass through edges */}
      <div className="fixed inset-x-0 bottom-0 z-40 md:hidden pointer-events-none">
        <div
          ref={sheet.sheetRef}
          data-detail-sheet
          className="pointer-events-auto mx-1.5 rounded-t-lg backdrop-blur-sm bg-sig-panel/96 border border-sig-border border-b-0 pt-0 flex flex-col"
          style={{
            height: `${sheet.heightVh}vh`,
            transform: `translateY(${sheet.offsetY}px)`,
            transition: sheet.settling
              ? "transform 200ms ease-out, height 200ms ease-out"
              : "none",
            willChange: "transform, height",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Fixed top: drag handle + header + buttons ── */}
          <div className="shrink-0 px-2.5">
            {/* Drag handle */}
            <div
              className="flex flex-col items-center py-3.5 -mx-2.5 cursor-grab touch-none bg-sig-panel/96 rounded-t-lg"
              onTouchStart={(e) => {
                e.stopPropagation();
                sheet.onTouchStart(e);
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
                sheet.onTouchMove(e);
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                //@ts-ignore
                sheet.onTouchEnd(e);
              }}
            >
              <div className="w-12 h-1.5 rounded-full bg-sig-dim/40" />
            </div>
            {/* Type label + close + action buttons */}
            <PanelHeader
              Icon={Icon}
              color={color}
              feature={feature}
              isolateMode={isolateMode}
              onSetIsolateMode={onSetIsolateMode}
              onZoomTo={handleLocate}
              locateActive={locateActive}
              onClose={onClose}
            />
          </div>

          {/* ── Scrollable body: data rows + coords + links ── */}
          <div className="flex-1 min-h-0 overflow-y-auto sigint-scroll px-2.5 pb-3">
            <PanelBody
              item={item}
              rows={rows}
              onOpenDossier={!hasDossier ? onOpenDossier : undefined}
            />
          </div>
        </div>
      </div>

      {/* Desktop: draggable floating card */}
      <div
        className={`hidden md:block absolute w-72 rounded-md backdrop-blur-sm z-40 bg-sig-panel/94 border border-sig-border p-3.5 top-3.5 max-h-[calc(100%-28px)] overflow-y-auto sigint-scroll ${side === "left" ? "left-3.5" : "right-3.5"}`}
        style={{ transform: `translate(${drag.pos.x}px, ${drag.pos.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          data-tour="detail-drag-handle"
          className="flex justify-center mb-1 -mt-1 text-sig-dim cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={drag.onPointerDown}
        >
          <GripHorizontal size={14} />
        </div>
        {content}
      </div>
    </>
  );
}

function MobileScrollHint({
  sheetRef,
}: {
  readonly sheetRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const check = () => {
      const hasOverflow = el.scrollHeight > el.clientHeight + 10;
      const nearTop = el.scrollTop < 5;
      setShow(hasOverflow && nearTop);
    };
    check();
    el.addEventListener("scroll", check);
    const ob = new ResizeObserver(check);
    ob.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ob.disconnect();
    };
  }, [sheetRef]);
  if (!show) return null;
  return (
    <div className="sticky bottom-0 left-0 right-0 flex justify-center py-1 pointer-events-none">
      <div className="text-[9px] tracking-widest text-sig-dim/50 animate-bounce">
        ▼ SCROLL
      </div>
    </div>
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

function PanelBody({
  item,
  rows,
  onOpenDossier,
}: {
  item: DataPoint;
  rows: [string, string][];
  onOpenDossier?: () => void;
}) {
  const dataRows = rows.filter(([, v]) => !isUrl(v));
  const linkRows = rows.filter(([, v]) => isUrl(v));

  return (
    <>
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

      {/* Open in Dossier button */}
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

function PanelHeader({
  Icon,
  color,
  feature,
  isolateMode,
  onSetIsolateMode,
  onZoomTo,
  locateActive,
  onClose,
}: {
  Icon: any;
  color: string | undefined;
  feature: any;
  isolateMode: null | "solo" | "focus";
  onSetIsolateMode: (mode: null | "solo" | "focus") => void;
  onZoomTo?: () => void;
  locateActive?: boolean;
  onClose: () => void;
}) {
  return (
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
          data-tour="detail-close"
          onClick={onClose}
          className="cursor-pointer text-[18px] leading-none select-none text-sig-dim touch-target flex items-center justify-center hover:text-sig-bright transition-colors"
        >
          ✕
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {onZoomTo && (
          <ModeButton
            active={locateActive ?? false}
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
  locateActive,
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
  locateActive?: boolean;
  onClose: () => void;
  onOpenDossier?: () => void;
}) {
  return (
    <>
      <PanelHeader
        Icon={Icon}
        color={color}
        feature={feature}
        isolateMode={isolateMode}
        onSetIsolateMode={onSetIsolateMode}
        onZoomTo={onZoomTo}
        locateActive={locateActive}
        onClose={onClose}
      />
      <PanelBody item={item} rows={rows} onOpenDossier={onOpenDossier} />
    </>
  );
}
