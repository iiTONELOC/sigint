// Geographic mini-map for a vessel — same approach as the cyclone/AC maps: a
// <canvas> reusing the globe's projGlobe + drawLand + drawGrid so the basemap
// matches the main globe, framed on the vessel's recorded track, draggable +
// zoomable. Draws the trail, the own-ship marker, and heading / COG vectors.

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getLand, enrichLand } from "@/lib/geo/landService";
import { projGlobe } from "@/components/globe/projection";
import { drawLand } from "@/components/globe/landRenderer";
import { drawGrid } from "@/components/globe/gridRenderer";

const PAD = 8;
const rad = (d: number) => (d * Math.PI) / 180;

function bearingPt(x: number, y: number, deg: number, len: number): [number, number] {
  const a = rad(deg);
  return [x + len * Math.sin(a), y - len * Math.cos(a)];
}

export function ShipMiniMap({
  lat,
  lon,
  heading,
  cog,
  sog,
  trail,
}: {
  readonly lat: number;
  readonly lon: number;
  readonly heading?: number;
  readonly cog?: number;
  readonly sog?: number;
  readonly trail: ReadonlyArray<{ lat: number; lon: number }>;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef({ ry: 0, rx: 0 });
  const dimsRef = useRef({ r: 1 });
  const [land, setLand] = useState(() => getLand());
  const [zoom, setZoom] = useState(1);

  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of [...trail, { lat, lon }]) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
  }
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  const spanDeg = Math.max(maxLat - minLat, (maxLon - minLon) * Math.cos(rad(midLat)), 0.4);

  useEffect(() => {
    panRef.current = { ry: 0, rx: 0 };
    setZoom(1);
  }, [lat, lon]);

  useEffect(() => {
    if (land.length === 0) enrichLand((l) => setLand(l));
  }, [land.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const accent = colors.ships;

    const draw = () => {
      const cssW = canvas.clientWidth || 264;
      const cssH = canvas.clientHeight || 200;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const cx = cssW / 2;
      const cy = cssH / 2;
      const frameR = Math.min(cssW, cssH) / 2 - PAD;
      const r = Math.min((frameR * 0.8) / Math.max(Math.sin(rad(spanDeg / 2)), 0.05), frameR * 60) * zoom;
      const ry = Math.PI / 2 - rad(midLon + 180) + panRef.current.ry;
      const rx = rad(midLat) + panRef.current.rx;
      dimsRef.current.r = r;
      const proj = (la: number, lo: number) => projGlobe(la, lo, cx, cy, r, ry, rx);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.oceanDeep;
      ctx.fill();
      ctx.clip();

      drawGrid(ctx, proj, { isFlat: false, accentColor: colors.grid });
      drawLand(ctx, proj, colors, false, cx, cy, r);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (trail.length >= 1) {
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let pen = false;
        for (const p of [...trail, { lat, lon }]) {
          const pp = proj(p.lat, p.lon);
          if (pp.z > 0) {
            if (pen) ctx.lineTo(pp.x, pp.y);
            else { ctx.moveTo(pp.x, pp.y); pen = true; }
          } else pen = false;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const pe = proj(lat, lon);
      if (pe.z > 0) {
        const vlen = Math.min(64, 16 + (sog ?? 0) * 2.5);
        if (cog != null) {
          const [vx, vy] = bearingPt(pe.x, pe.y, cog, vlen);
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = accent;
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(pe.x, pe.y);
          ctx.lineTo(vx, vy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        if (heading != null && heading !== 511) {
          const [hx, hy] = bearingPt(pe.x, pe.y, heading, vlen * 0.7);
          ctx.strokeStyle = colors.bright;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(pe.x, pe.y);
          ctx.lineTo(hx, hy);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(pe.x, pe.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pe.x, pe.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = colors.coast;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    let dragging = false;
    let lx = 0, ly = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const rr = dimsRef.current.r || 1;
      panRef.current.ry += (e.clientX - lx) / rr;
      panRef.current.rx = Math.max(-1.2, Math.min(1.2, panRef.current.rx + (e.clientY - ly) / rr));
      lx = e.clientX; ly = e.clientY;
      draw();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [lat, lon, heading, cog, sog, trail, land, colors, midLat, midLon, spanDeg, zoom]);

  const zoomBtn =
    "w-6 h-6 flex items-center justify-center rounded bg-sig-panel/80 border border-sig-border/60 text-sig-dim hover:text-(--dossier-accent) hover:border-(--dossier-accent)/50 transition-colors";

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block rounded-[10px] border border-sig-border touch-none cursor-grab active:cursor-grabbing"
        aria-label="Vessel position and track over coastline"
      />
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
        <button type="button" className={zoomBtn} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(12, z * 1.4))}>+</button>
        <button type="button" className={zoomBtn} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, z / 1.4))}>−</button>
      </div>
    </div>
  );
}
