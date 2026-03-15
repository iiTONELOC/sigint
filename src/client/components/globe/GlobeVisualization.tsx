import { enrichLand } from "@/lib/landService";
import { getInterpolatedPosition, type TrailPoint } from "@/lib/trailService";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import type {
  GlobeVisualizationProps,
  CamState,
  CamTarget,
  DragState,
  ProjFn,
} from "./types";
import { getFlatMetrics, projGlobe, projFlat } from "./projection";
import { drawLand } from "./landRenderer";
import { drawGrid } from "./gridRenderer";
import { drawPoints } from "./pointRenderer";
import { updateCamera } from "./cameraSystem";
import {
  createInputHandlers,
  attachInputHandlers,
  detachInputHandlers,
} from "./inputHandlers";

export function GlobeVisualization({
  flat = false,
  autoRotate = true,
  rotationSpeed = 1,
  data,
  layers,
  aircraftFilter,
  selected,
  isolatedId,
  isolateMode,
  onSelect,
  onRawCanvasClick,
  onMiddleClick,
  onSelectedSide,
  zoomToId,
  searchMatchIds,
}: Readonly<GlobeVisualizationProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<CamState>({
    rotY: 0,
    rotX: 0.3,
    vy: 0,
    zoomGlobe: 1,
    zoomFlat: 1,
    panX: 0,
    panY: 0,
  });
  const camTargetRef = useRef<CamTarget>({
    rotY: 0,
    rotX: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    active: false,
    lockedId: null,
  });
  const dragRef = useRef<DragState>({
    active: false,
    interactive: false,
    lx: 0,
    ly: 0,
    dist: 0,
    sx: 0,
    sy: 0,
    pinching: false,
    pinchDist: 0,
    lastClickTime: 0,
    lastClickId: null,
  });
  const sizeRef = useRef({ w: 800, h: 600 });
  const [trailTooltip, setTrailTooltip] = useState<TrailPoint | null>(null);
  const trailTooltipPointRef = useRef<TrailPoint | null>(null);
  const trailTooltipElRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({
    data,
    layers,
    aircraftFilter,
    flat,
    autoRotate,
    rotationSpeed,
    selected,
    isolatedId,
    isolateMode,
    onSelect,
    onRawCanvasClick,
    onMiddleClick,
    onSelectedSide,
    zoomToId,
    searchMatchIds,
  });
  propsRef.current = {
    data,
    layers,
    aircraftFilter,
    flat,
    autoRotate,
    rotationSpeed,
    selected,
    isolatedId,
    isolateMode,
    onSelect,
    onRawCanvasClick,
    onMiddleClick,
    onSelectedSide,
    zoomToId,
    searchMatchIds,
  };

  const { theme } = useTheme();
  const colorsRef = useRef(theme.colors);
  colorsRef.current = theme.colors;

  // ── External zoom-to trigger (from search) ──────────────────────────
  const lastZoomToIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!zoomToId || zoomToId === lastZoomToIdRef.current) return;
    lastZoomToIdRef.current = zoomToId;

    const item = data.find((d) => d.id === zoomToId);
    if (!item) return;

    const camTarget = camTargetRef.current;
    const cam = camRef.current;
    const isFlat = flat;

    const interp = getInterpolatedPosition(item.id);
    const tLat = interp ? interp.lat : item.lat;
    const tLon = interp ? interp.lon : item.lon;

    if (isFlat) {
      const { w: fw, h: fh } = sizeRef.current;
      const targetZoom = Math.max(cam.zoomFlat, 40);
      const mW = fw * 0.92 * targetZoom;
      const mH = fh * 0.84 * targetZoom;
      camTarget.panX = -(tLon / 180) * (mW / 2);
      camTarget.panY = (tLat / 90) * (mH / 2);
      camTarget.zoom = targetZoom;
    } else {
      const phi = ((90 - tLat) * Math.PI) / 180;
      const theta = ((tLon + 180) * Math.PI) / 180;
      camTarget.rotY = Math.PI / 2 - theta;
      camTarget.rotX = -(phi - Math.PI / 2);
      camTarget.zoom = Math.max(cam.zoomGlobe, 35);
    }
    camTarget.active = true;
    camTarget.lockedId = zoomToId;
  }, [zoomToId, data, flat]);

  // ── Render loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let running = true;

    enrichLand(() => {});

    const render = () => {
      if (!running) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { w: W, h: H } = sizeRef.current;
      const cx = W / 2,
        cy = H / 2;
      const cam = camRef.current;
      const drag = dragRef.current;
      const {
        data: d,
        layers: ly,
        aircraftFilter: af,
        flat: isFlat,
        autoRotate: shouldRotate,
        rotationSpeed: rotSpeed,
        selected: sel,
        isolatedId: iso,
        isolateMode: isoMode,
        searchMatchIds: sMatch,
      } = propsRef.current;
      const C = colorsRef.current;
      const t = Date.now() * 0.003;

      // Camera update
      updateCamera(
        cam,
        camTargetRef.current,
        drag,
        sel,
        isFlat,
        shouldRotate,
        rotSpeed,
        W,
        H,
      );

      // Report which side of the screen the selected item is on
      if (sel && propsRef.current.onSelectedSide) {
        const selInterp = getInterpolatedPosition(sel.id);
        const sLat = selInterp ? selInterp.lat : sel.lat;
        const sLon = selInterp ? selInterp.lon : sel.lon;
        const sp = isFlat
          ? (() => {
              const fm = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
              return projFlat(sLat, sLon, fm.cx, fm.cy, fm.mW, fm.mH);
            })()
          : projGlobe(
              sLat,
              sLon,
              cx,
              cy,
              Math.min(W, H) * 0.4 * cam.zoomGlobe,
              cam.rotY,
              cam.rotX,
            );
        if (sp.z > 0) {
          propsRef.current.onSelectedSide(sp.x > W / 2 ? "left" : "right");
        }
      }

      ctx.clearRect(0, 0, W, H);

      if (!isFlat) {
        const r = Math.min(W, H) * 0.4 * cam.zoomGlobe;
        const proj: ProjFn = (lat, lon) =>
          projGlobe(lat, lon, cx, cy, r, cam.rotY, cam.rotX);

        // Glow
        const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.4);
        glow.addColorStop(0, C.accent + "0d");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // Solid ocean
        const bg = ctx.createRadialGradient(
          cx - r * 0.2,
          cy - r * 0.2,
          0,
          cx,
          cy,
          r,
        );
        bg.addColorStop(0, "#0e1825");
        bg.addColorStop(1, "#060c16");
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();

        // Clip to globe
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
        ctx.clip();

        drawLand(ctx, proj, C, false, cx, cy, r - 0.5);
        drawGrid(ctx, proj, { isFlat: false, accentColor: C.accent });

        ctx.restore();

        // Rim
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = C.accent + "1f";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        drawPoints(ctx, d, ly, af, sel, iso, isoMode, proj, t, C, sMatch);
      } else {
        const {
          mW,
          mH,
          mx,
          my,
          cx: flatCx,
          cy: flatCy,
        } = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
        const proj: ProjFn = (lat, lon) =>
          projFlat(lat, lon, flatCx, flatCy, mW, mH);

        ctx.fillStyle = "#081018";
        ctx.fillRect(mx, my, mW, mH);

        ctx.save();
        ctx.beginPath();
        ctx.rect(mx, my, mW, mH);
        ctx.clip();

        drawLand(ctx, proj, C, true, 0, 0, 0);
        drawGrid(ctx, proj, {
          isFlat: true,
          cx,
          cy,
          mW,
          mH,
          mx,
          my,
          accentColor: C.accent,
        });
        drawPoints(ctx, d, ly, af, sel, iso, isoMode, proj, t, C, sMatch);

        ctx.restore();

        ctx.strokeStyle = C.accent + "1a";
        ctx.lineWidth = 1;
        ctx.strokeRect(mx, my, mW, mH);

        ctx.globalAlpha = 1;
        ctx.fillStyle = C.dim;
        const baseFontSize = Math.max(8, Math.min(W, H) * 0.015);
        ctx.font = `${baseFontSize}px 'JetBrains Mono', monospace`;
        ctx.textAlign = "center";
        for (let lon = -120; lon <= 120; lon += 60) {
          ctx.fillText(
            `${Math.abs(lon)}\u00B0${lon >= 0 ? "E" : "W"}`,
            flatCx + (lon / 180) * (mW / 2),
            my + mH + 13,
          );
        }
        ctx.textAlign = "right";
        for (let lat = -60; lat <= 60; lat += 30) {
          ctx.fillText(
            `${Math.abs(lat)}\u00B0${lat >= 0 ? "N" : "S"}`,
            mx - 5,
            flatCy - (lat / 90) * (mH / 2) + 3,
          );
        }
      }

      // Update trail tooltip position if active
      const ttEl = trailTooltipElRef.current;
      const ttPoint = trailTooltipPointRef.current;
      if (ttEl && ttPoint) {
        const proj: ProjFn = isFlat
          ? (lat, lon) => {
              const fm = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
              return projFlat(lat, lon, fm.cx, fm.cy, fm.mW, fm.mH);
            }
          : (lat, lon) =>
              projGlobe(
                lat,
                lon,
                cx,
                cy,
                Math.min(W, H) * 0.4 * cam.zoomGlobe,
                cam.rotY,
                cam.rotX,
              );
        const p = proj(ttPoint.lat, ttPoint.lon);
        if (p.z > 0) {
          const ttW = ttEl.offsetWidth || 200;
          const ttH = ttEl.offsetHeight || 80;
          // Default to left of dot (away from detail panel on right)
          // Flip to right only if too close to left edge
          const showRight = p.x - ttW - 16 < 0;
          const xPos = showRight ? p.x + 14 : p.x - ttW - 14;
          // Vertically center on the dot, clamp to viewport
          const yPos = Math.max(4, Math.min(H - ttH - 4, p.y - ttH / 2));
          ttEl.style.left = `${xPos}px`;
          ttEl.style.top = `${yPos}px`;
          ttEl.style.display = "";
        } else {
          ttEl.style.display = "none";
        }
      }

      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
    return () => {
      running = false;
    };
  }, []);

  // ── Resize observer ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const par = canvas.parentElement;
    if (!par) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = par.clientWidth,
        h = par.clientHeight;
      if (w === 0 || h === 0) return;
      const cw = Math.round(w * dpr);
      const ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      sizeRef.current = { w, h };
    };
    resize();
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    ro.observe(par);
    return () => {
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, []);

  // ── Input handlers ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlers = createInputHandlers({
      canvas,
      camRef,
      camTargetRef,
      dragRef,
      sizeRef,
      propsRef,
      setTrailTooltip,
    });

    attachInputHandlers(canvas, handlers);
    return () => detachInputHandlers(canvas, handlers);
  }, []);

  // Sync tooltip point ref for render loop reprojection
  useEffect(() => {
    trailTooltipPointRef.current = trailTooltip;
  }, [trailTooltip]);

  // Clear tooltip when selection changes
  useEffect(() => {
    setTrailTooltip(null);
  }, [selected?.id]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: "default", display: "block" }}
      />
      {trailTooltip && (
        <div
          ref={trailTooltipElRef}
          className="absolute pointer-events-none z-30 rounded px-2.5 py-1.5 bg-sig-panel/95 border border-sig-accent/40 backdrop-blur-sm text-(length:--sig-text-sm)"
          style={{ maxWidth: 200 }}
        >
          <div className="text-sig-accent tracking-wider mb-0.5">
            {new Date(trailTooltip.ts).toLocaleTimeString("en-US", {
              hour12: false,
            })}
            <span className="text-sig-dim ml-1.5">
              {(() => {
                const ago = Math.round((Date.now() - trailTooltip.ts) / 60000);
                if (ago < 1) return "now";
                if (ago < 60) return `${ago}m ago`;
                return `${Math.floor(ago / 60)}h ${ago % 60}m ago`;
              })()}
            </span>
          </div>
          {trailTooltip.altitude != null && (
            <div className="text-sig-bright">
              ALT{" "}
              <span className="text-sig-text">{trailTooltip.altitude} ft</span>
            </div>
          )}
          {trailTooltip.speed != null && (
            <div className="text-sig-bright">
              SPD <span className="text-sig-text">{trailTooltip.speed} kn</span>
            </div>
          )}
          {trailTooltip.heading != null && (
            <div className="text-sig-bright">
              HDG <span className="text-sig-text">{trailTooltip.heading}°</span>
            </div>
          )}
          {trailTooltip.altitude == null &&
            trailTooltip.speed == null &&
            trailTooltip.heading == null && (
              <div className="text-sig-dim">No snapshot data</div>
            )}
          <div className="text-sig-dim mt-0.5">
            {Math.abs(trailTooltip.lat).toFixed(3)}°
            {trailTooltip.lat >= 0 ? "N" : "S"},{" "}
            {Math.abs(trailTooltip.lon).toFixed(3)}°
            {trailTooltip.lon >= 0 ? "E" : "W"}
          </div>
        </div>
      )}
    </div>
  );
}
