// ── CycloneForecastMiniMap ───────────────────────────────────────────
// Interactive orthographic-globe minimap of the storm track — same technique as
// the aircraft route map: a <canvas> that reuses the globe's own renderers
// (projGlobe + drawLand + drawGrid) so the basemap matches the main globe, with
// drag-to-pan and +/- zoom. Draws cyclone geometry instead of a route: observed
// past track (genesis→now), dashed forecast track, cone (error-radius discs),
// category-colored forecast points, and spaghetti model guidance when supplied.

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getLand, enrichLand } from "@/lib/geo/landService";
import { projGlobe } from "@/components/globe/projection";
import { drawLand } from "@/components/globe/landRenderer";
import { drawGrid } from "@/components/globe/gridRenderer";
import type { ForecastPoint, PastTrackPoint, WindRadii, ModelTrack } from "../types";
import { windColor, modelColor, categoryShort, SAFFIR_LEGEND } from "../classification";
import {
  NM_PER_DEG,
  windRadiiBandColor,
  windRadiiBandPoints,
  segmentedConeSegments,
} from "../render/cycloneGeometry";

const PAD = 8;
const rad = (d: number) => (d * Math.PI) / 180;

export function CycloneForecastMiniMap({
  current,
  forecast,
  pastTrack,
  windRadii,
  models,
  showForecast = true,
  showCone = true,
  showWindField = false,
  showModels = false,
}: {
  readonly current: { lat: number; lon: number; maxWindKt: number };
  readonly forecast: ForecastPoint[];
  readonly pastTrack?: PastTrackPoint[];
  readonly windRadii?: WindRadii;
  readonly models?: ModelTrack[];
  /** Gate the forecast track + past track (TRACK toggle). */
  readonly showForecast?: boolean;
  /** Gate the cone discs (CONE toggle). */
  readonly showCone?: boolean;
  /** Gate the 34/50/64-kt wind radii at the eye (WIND FIELD toggle). */
  readonly showWindField?: boolean;
  /** Gate the spaghetti model tracks (MODELS toggle). */
  readonly showModels?: boolean;
}) {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef({ ry: 0, rx: 0 });
  const dimsRef = useRef({ r: 1 });
  const [land, setLand] = useState(() => getLand());
  const [zoom, setZoom] = useState(1);
  const colors = theme.colors;

  // Frame the whole track (past + forecast) so it fits, recentred on its midpoint.
  const all = [
    ...(pastTrack ?? []).map((p) => ({ lat: p.lat, lon: p.lon })),
    { lat: current.lat, lon: current.lon },
    ...forecast.map((f) => ({ lat: f.lat, lon: f.lon })),
  ];
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of all) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
  }
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  const spanDeg = Math.max(maxLat - minLat, (maxLon - minLon) * Math.cos(rad(midLat)), 1);

  useEffect(() => {
    panRef.current = { ry: 0, rx: 0 };
    setZoom(1);
  }, [current.lat, current.lon]);

  useEffect(() => {
    if (land.length === 0) enrichLand((l) => setLand(l));
  }, [land.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
      // Globe radius so the track span fills ~80% of the frame.
      const r = Math.min((frameR * 0.8) / Math.max(Math.sin(rad(spanDeg / 2)), 0.05), frameR * 9) * zoom;
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

      // Cone + track use the storm's Saffir-Simpson category color (matches the
      // rest of the dossier), not the generic cyclones-layer red.
      const accent = windColor(current.maxWindKt);
      const strokeLine = (pts: { lat: number; lon: number }[], dash: number[]) => {
        ctx.setLineDash(dash);
        ctx.beginPath();
        let pen = false;
        for (const p of pts) {
          const pp = proj(p.lat, p.lon);
          if (pp.z > 0) {
            if (pen) ctx.lineTo(pp.x, pp.y);
            else { ctx.moveTo(pp.x, pp.y); pen = true; }
          } else pen = false;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Spaghetti model tracks — thin muted lines beneath the official track
      // (MODELS toggle).
      if (showModels && models) {
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.25;
        for (const m of models) {
          ctx.strokeStyle = modelColor(m.model);
          strokeLine(m.points, []);
        }
        ctx.globalAlpha = 1;
      }

      // Cone — tapered segmented band matching the globe (shared geometry).
      if (showCone) {
        const eye = proj(current.lat, current.lon);
        if (eye.z > 0) {
          for (const seg of segmentedConeSegments(eye.x, eye.y, forecast, proj, current.maxWindKt)) {
            ctx.beginPath();
            seg.quad.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
            ctx.closePath();
            // Color each band by its far-point forecast intensity so the cone
            // cools as the storm weakens — matches the forecast dots.
            ctx.fillStyle = seg.maxWindKt > 0 ? windColor(seg.maxWindKt) : accent;
            ctx.globalAlpha = 0.3 - 0.18 * seg.t;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }

      // Wind radii at the eye — 34/50/64-kt footprint, shared band geometry.
      if (showWindField && windRadii) {
        const eye = proj(current.lat, current.lon);
        if (eye.z > 0) {
          const pxPerNm = rad(1) * r / NM_PER_DEG;
          const bands: ReadonlyArray<readonly [number, number[] | null]> = [
            [34, windRadii.kt34],
            [50, windRadii.kt50],
            [64, windRadii.kt64],
          ];
          for (const [kt, q] of bands) {
            if (!q) continue;
            const pts = windRadiiBandPoints(q, eye.x, eye.y, pxPerNm);
            if (pts.length === 0) continue;
            ctx.beginPath();
            pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
            ctx.closePath();
            ctx.fillStyle = windRadiiBandColor(kt);
            ctx.globalAlpha = 0.18;
            ctx.fill();
            ctx.globalAlpha = 0.9;
            ctx.lineWidth = 1;
            ctx.strokeStyle = windRadiiBandColor(kt);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      // Observed past track (genesis → now), solid (TRACK toggle).
      if (showForecast && pastTrack && pastTrack.length >= 1) {
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5;
        strokeLine([...pastTrack, { lat: current.lat, lon: current.lon }], []);
        ctx.globalAlpha = 1;
        const genesis = pastTrack.at(0);
        if (genesis) {
          const genesisPoint = proj(genesis.lat, genesis.lon);
          if (genesisPoint.z > 0) {
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(genesisPoint.x - 3, genesisPoint.y - 3);
            ctx.lineTo(genesisPoint.x + 3, genesisPoint.y + 3);
            ctx.moveTo(genesisPoint.x - 3, genesisPoint.y + 3);
            ctx.lineTo(genesisPoint.x + 3, genesisPoint.y - 3);
            ctx.stroke();
          }
        }
      }

      // Forecast track (dashed) eye → forecast points (TRACK toggle).
      if (showForecast) {
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.5;
        strokeLine([{ lat: current.lat, lon: current.lon }, ...forecast], [4, 3]);
        ctx.globalAlpha = 1;
      }

      // Forecast points — category-colored dots, each tagged with its category.
      for (const f of showForecast ? forecast : []) {
        const p = proj(f.lat, f.lon);
        if (p.z <= 0) continue;
        const col = windColor(f.maxWindKt);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        // Category tag above-right of the dot.
        ctx.font = "600 9px 'JetBrains Mono', monospace";
        ctx.fillStyle = col;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(categoryShort(f.maxWindKt), p.x + 4, p.y - 3);
      }
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";

      // Current eye — bullseye in the storm color.
      const pe = proj(current.lat, current.lon);
      if (pe.z > 0) {
        ctx.beginPath();
        ctx.arc(pe.x, pe.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = windColor(current.maxWindKt);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pe.x, pe.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      ctx.restore();

      // Rim.
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
  }, [current.lat, current.lon, current.maxWindKt, forecast, pastTrack, windRadii, models, showForecast, showCone, showWindField, showModels, land, colors, midLat, midLon, spanDeg, zoom]);

  const zoomBtn =
    "w-6 h-6 flex items-center justify-center rounded bg-sig-panel/80 border border-sig-border/60 text-sig-dim hover:text-(--dossier-accent) hover:border-(--dossier-accent)/50 transition-colors touch-target";

  return (
    <div className="relative w-full h-full min-h-48">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block rounded-[10px] border border-sig-border touch-none cursor-grab active:cursor-grabbing"
        aria-label="Forecast track — storm position, past track, and forecast over coastline"
      />
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
        <button type="button" className={zoomBtn} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(8, z * 1.4))}>+</button>
        <button type="button" className={zoomBtn} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z / 1.4))}>−</button>
      </div>
      {/* Saffir-Simpson key — color, category, wind range — so the cone/dot
          colors read as categories on the map. */}
      <div className="absolute bottom-1.5 left-1.5 flex flex-col gap-px rounded bg-sig-bg/70 backdrop-blur-sm px-1.5 py-1 text-(length:--sig-text-xs) leading-tight">
        {SAFFIR_LEGEND.map((b) => (
          <span key={b.label} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: b.color }} />
            <span className="font-semibold w-5" style={{ color: b.color }}>{b.label}</span>
            <span className="text-sig-dim">{b.range}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
