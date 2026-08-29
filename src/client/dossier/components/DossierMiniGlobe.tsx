import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme, type ThemeColors } from "@/theme";
import { enrichLand, getLand } from "@/lib/geo/landService";
import { drawGrid } from "@/lib/geo/render/grid";
import { drawLand } from "@/lib/geo/render/land";
import { CanvasLineStyle, type ProjFn } from "@/lib/geo/render/types";
import { projectGeographicPoint } from "@/lib/geo/unitSphere";
import { ButtonType } from "@/lib/ui/button";
import { DomEvent } from "@/runtime";
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

export type DossierMiniGlobeProps = Readonly<{
  ariaLabel: string;
  camera: DossierMiniGlobeCamera;
  children?: ReactNode;
  compactBorderRadius?: boolean;
  drawForeground?: DossierMiniGlobeOverlay;
  drawOverlay: DossierMiniGlobeOverlay;
  reserveMinimumHeight?: boolean;
  resetKey: string;
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
  reserveMinimumHeight = false,
  resetKey,
}: DossierMiniGlobeProps) {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef({ latitude: 0, longitude: 0 });
  const radiusRef = useRef(1);
  const initialZoom = 1;
  const [land, setLand] = useState(() => getLand());
  const [zoom, setZoom] = useState(initialZoom);

  useEffect(() => {
    panRef.current = { latitude: 0, longitude: 0 };
    setZoom(initialZoom);
  }, [initialZoom, resetKey]);

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

    let lastPointer: Readonly<{ x: number; y: number }> | null = null;
    const onPointerDown = (event: PointerEvent): void => {
      lastPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!lastPointer) return;
      const radius = radiusRef.current || 1;
      panRef.current.longitude += (event.clientX - lastPointer.x) / radius;
      const nextLatitude =
        panRef.current.latitude + (event.clientY - lastPointer.y) / radius;
      panRef.current.latitude = Math.max(-1.2, Math.min(1.2, nextLatitude));
      lastPointer = { x: event.clientX, y: event.clientY };
      draw();
    };
    const onPointerUp = (event: PointerEvent): void => {
      lastPointer = null;
      canvas.releasePointerCapture?.(event.pointerId);
    };

    draw();
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    canvas.addEventListener(DomEvent.PointerDown, onPointerDown);
    canvas.addEventListener(DomEvent.PointerMove, onPointerMove);
    canvas.addEventListener(DomEvent.PointerUp, onPointerUp);
    canvas.addEventListener(DomEvent.PointerCancel, onPointerUp);
    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener(DomEvent.PointerDown, onPointerDown);
      canvas.removeEventListener(DomEvent.PointerMove, onPointerMove);
      canvas.removeEventListener(DomEvent.PointerUp, onPointerUp);
      canvas.removeEventListener(DomEvent.PointerCancel, onPointerUp);
    };
  }, [
    camera.centerLatitude,
    camera.centerLongitude,
    camera.radiusScale,
    camera.spanDegrees,
    drawForeground,
    drawOverlay,
    land,
    theme.colors,
    zoom,
  ]);

  const borderRadius = compactBorderRadius ? "rounded" : "rounded-[10px]";
  const minimumHeight = reserveMinimumHeight ? "min-h-48" : "";
  const zoomFactor = 1.4;
  return (
    <div className={`relative w-full h-full ${minimumHeight}`}>
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full block ${borderRadius} border border-sig-border touch-none cursor-grab active:cursor-grabbing`}
        aria-label={ariaLabel}
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
