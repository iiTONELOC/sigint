import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useTheme, type ThemeColors } from "@/theme";
import { DomEvent, DomPointerType } from "@/runtime";
import { CAMERA_POLICY } from "@/workers/render/policy";
import { enrichLand, getLand } from "@/lib/geo/landService";
import { drawGrid } from "@/lib/geo/render/grid";
import { drawLand } from "@/lib/geo/render/land";
import { CanvasLineStyle, type ProjFn } from "@/lib/geo/render/types";
import { projectGeographicPoint } from "@/lib/geo/unitSphere";
import { ButtonType } from "@/lib/ui/button";
import { AngleConversion, TurnDeg } from "@shared/geo";

export type DossierMiniGlobeCamera = Readonly<{
  centerLatitude: number;
  centerLongitude: number;
  maximumZoom: number;
  minimumZoom: number;
  radiusScale: number;
  spanDegrees: number;
}>;

export type DossierMiniGlobeDrawContext = Readonly<{
  centerX: number;
  centerY: number;
  colors: ThemeColors;
  context: CanvasRenderingContext2D;
  project: ProjFn;
  radius: number;
}>;

export type DossierMiniGlobeOverlay = (
  scene: DossierMiniGlobeDrawContext,
) => void;

type DossierMiniGlobePoint = Readonly<{ x: number; y: number }>;

type DossierMiniGlobeHold = {
  holding: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
};

function touchPoint(event: TouchEvent): DossierMiniGlobePoint | null {
  const touch = event.touches.item(0);
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

export type DossierMiniGlobeProps = Readonly<{
  ariaLabel: string;
  camera: DossierMiniGlobeCamera;
  children?: ReactNode;
  compactBorderRadius?: boolean;
  drawForeground?: DossierMiniGlobeOverlay;
  drawOverlay: DossierMiniGlobeOverlay;
  redrawEveryMs?: number;
  reserveMinimumHeight?: boolean;
}>;

export const DOSSIER_MINI_GLOBE_ZOOM_BUTTON_CLASS_NAME =
  "w-6 h-6 flex items-center justify-center rounded bg-sig-panel/80 border border-sig-border/60 text-sig-dim hover:text-(--dossier-accent) hover:border-(--dossier-accent)/50 transition-colors touch-target";

export function drawDossierMiniGlobeBase(
  scene: DossierMiniGlobeDrawContext,
  drawOverlay: DossierMiniGlobeOverlay,
  drawForeground?: DossierMiniGlobeOverlay,
): void {
  const { centerX, centerY, colors, context, project, radius } = scene;
  const fullCircleRadians =
    TurnDeg.Full * AngleConversion.RadiansPerDegree;
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, fullCircleRadians);
  context.fillStyle = colors.oceanDeep;
  context.fill();
  context.clip();
  drawGrid(context, project, { isFlat: false, accentColor: colors.grid });
  drawLand(context, project, {
    colors,
    isFlat: false,
    horizon: { gcx: centerX, gcy: centerY, gr: radius },
  });
  context.lineCap = CanvasLineStyle.Round;
  context.lineJoin = CanvasLineStyle.Round;
  drawOverlay(scene);
  context.restore();

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, fullCircleRadians);
  context.strokeStyle = colors.coast;
  context.globalAlpha = 0.4;
  context.lineWidth = 1;
  context.stroke();
  context.globalAlpha = 1;
  drawForeground?.(scene);
}

export function DossierMiniGlobe({
  ariaLabel,
  camera,
  children,
  compactBorderRadius = false,
  drawForeground,
  drawOverlay,
  redrawEveryMs,
  reserveMinimumHeight = false,
}: DossierMiniGlobeProps) {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef({ latitude: 0, longitude: 0 });
  const radiusRef = useRef(1);
  const pointerRef = useRef<DossierMiniGlobePoint | null>(null);
  const holdRef = useRef<DossierMiniGlobeHold>({ holding: false, timer: undefined });
  const drawRef = useRef<() => void>(() => undefined);
  const initialZoom = 1;
  const [land, setLand] = useState(() => getLand());
  const [zoom, setZoom] = useState(initialZoom);

  useEffect(() => {
    if (land.length === 0) enrichLand((polygons) => setLand(polygons));
  }, [land.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = (): void => {
      const width = canvas.clientWidth || 264;
      const height = canvas.clientHeight || 200;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = (Math.min(width, height) / 2 - 8) * camera.radiusScale * zoom;
      const rotationY =
        TurnDeg.Quarter * AngleConversion.RadiansPerDegree -
        (camera.centerLongitude + TurnDeg.Half) * AngleConversion.RadiansPerDegree +
        panRef.current.longitude;
      const rotationX =
        camera.centerLatitude * AngleConversion.RadiansPerDegree +
        panRef.current.latitude;
      radiusRef.current = radius;
      const project: ProjFn = (latitude, longitude) =>
        projectGeographicPoint(
          latitude,
          longitude,
          centerX,
          centerY,
          radius,
          rotationY,
          rotationX,
        );
      drawDossierMiniGlobeBase(
        { centerX, centerY, colors: theme.colors, context, project, radius },
        drawOverlay,
        drawForeground,
      );
    };

    drawRef.current = draw;
    draw();
    const redrawTimer = redrawEveryMs ? setInterval(draw, redrawEveryMs) : undefined;
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    return () => {
      clearInterval(redrawTimer);
      resizeObserver.disconnect();
    };
  }, [
    camera.centerLatitude,
    camera.centerLongitude,
    camera.radiusScale,
    camera.spanDegrees,
    drawForeground,
    drawOverlay,
    land,
    redrawEveryMs,
    theme.colors,
    zoom,
  ]);

  const panTo = useCallback((next: DossierMiniGlobePoint): void => {
    const lastPointer = pointerRef.current;
    if (!lastPointer) return;
    const radius = radiusRef.current || 1;
    panRef.current.longitude += (next.x - lastPointer.x) / radius;
    const nextLatitude =
      panRef.current.latitude + (next.y - lastPointer.y) / radius;
    panRef.current.latitude = Math.max(
      -CAMERA_POLICY.pitchLimitRadians,
      Math.min(CAMERA_POLICY.pitchLimitRadians, nextLatitude),
    );
    pointerRef.current = next;
    drawRef.current();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hold = holdRef.current;
    const release = (): void => {
      clearTimeout(hold.timer);
      hold.holding = false;
      pointerRef.current = null;
    };
    const onTouchStart = (event: TouchEvent): void => {
      const start = touchPoint(event);
      if (!start || event.touches.length > 1) return;
      clearTimeout(hold.timer);
      hold.holding = false;
      pointerRef.current = start;
      hold.timer = setTimeout(() => {
        hold.holding = pointerRef.current !== null;
      }, CAMERA_POLICY.touchHoldMs);
    };
    const onTouchMove = (event: TouchEvent): void => {
      const next = touchPoint(event);
      const lastPointer = pointerRef.current;
      if (!next || !lastPointer) return;
      if (hold.holding) {
        event.preventDefault();
        panTo(next);
        return;
      }
      const travelled = Math.hypot(next.x - lastPointer.x, next.y - lastPointer.y);
      if (travelled > CAMERA_POLICY.dragClickThresholdPx) release();
    };
    canvas.addEventListener(DomEvent.TouchStart, onTouchStart, { passive: true });
    canvas.addEventListener(DomEvent.TouchMove, onTouchMove, { passive: false });
    canvas.addEventListener(DomEvent.TouchEnd, release);
    canvas.addEventListener(DomEvent.TouchCancel, release);
    return () => {
      canvas.removeEventListener(DomEvent.TouchStart, onTouchStart);
      canvas.removeEventListener(DomEvent.TouchMove, onTouchMove);
      canvas.removeEventListener(DomEvent.TouchEnd, release);
      canvas.removeEventListener(DomEvent.TouchCancel, release);
      release();
    };
  }, [panTo]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (event.pointerType === DomPointerType.Touch) return;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (event.pointerType === DomPointerType.Touch) return;
    panTo({ x: event.clientX, y: event.clientY });
  };
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (event.pointerType === DomPointerType.Touch) return;
    pointerRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const borderRadius = compactBorderRadius ? "rounded" : "rounded-[10px]";
  const minimumHeight = reserveMinimumHeight ? "min-h-48" : "";
  const zoomFactor = 1.4;
  return (
    <div className={`relative w-full h-full ${minimumHeight}`}>
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full block ${borderRadius} border border-sig-border touch-pan-y cursor-grab active:cursor-grabbing`}
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {children}
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
        <button
          type={ButtonType.Button}
          className={DOSSIER_MINI_GLOBE_ZOOM_BUTTON_CLASS_NAME}
          aria-label="Zoom in"
          onClick={() => setZoom((value) =>
            Math.min(camera.maximumZoom, value * zoomFactor))}
        >
          +
        </button>
        <button
          type={ButtonType.Button}
          className={DOSSIER_MINI_GLOBE_ZOOM_BUTTON_CLASS_NAME}
          aria-label="Zoom out"
          onClick={() => setZoom((value) =>
            Math.max(camera.minimumZoom, value / zoomFactor))}
        >
          −
        </button>
      </div>
    </div>
  );
}
