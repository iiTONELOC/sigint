// ── AircraftRouteMap ─────────────────────────────────────────────────
// Origin → destination view on an orthographic globe centered on the route.
// Rendering reuses the globe's own canvas renderers — drawLand (horizon
// clipping + theme coastFill/coast) and drawGrid — with projGlobe, so the land
// matches the main globe instead of a hand-rolled copy. Only the route geometry
// (great-circle math) and the route/aircraft overlay live here.

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getLand, enrichLand } from "@/lib/geo/landService";
import { getAirport, enrichAirports } from "@/lib/geo/airportService";
import { projectGeographicPoint as projGlobe } from "@/lib/geo/unitSphere";
import { drawLand } from "@/lib/geo/render/land";
import { drawGrid } from "@/lib/geo/render/grid";

const H = 200;
const PAD = 8;
const N = 48;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function gcDist(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dPhi = rad(bLat - aLat);
  const dLam = rad(bLon - aLon);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLam / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function gcPoint(aLat: number, aLon: number, bLat: number, bLon: number, f: number) {
  const d = gcDist(aLat, aLon, bLat, bLon);
  if (d === 0) return { lat: aLat, lon: aLon };
  const phi1 = rad(aLat), lam1 = rad(aLon), phi2 = rad(bLat), lam2 = rad(bLon);
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
  const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
  const z = A * Math.sin(phi1) + B * Math.sin(phi2);
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) };
}

type RouteHud = {
  readonly mach?: string;
  readonly tas?: string;
  readonly heading?: string;
  readonly eta?: string;
};

export function AircraftRouteMap({
  originCode,
  destCode,
  lat,
  lon,
  heading,
  waypoints,
  trail,
  hud,
}: {
  readonly originCode: string;
  readonly destCode: string;
  readonly lat: number;
  readonly lon: number;
  readonly heading?: number;
  readonly waypoints?: [number, number][];
  readonly trail?: readonly { lat: number; lon: number }[];
  readonly hud?: RouteHud;
}) {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef({ ry: 0, rx: 0 });
  const dimsRef = useRef({ r: 1 });
  const [land, setLand] = useState(() => getLand());
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Reset pan + zoom when the flight changes.
  useEffect(() => {
    panRef.current = { ry: 0, rx: 0 };
    setZoom(1);
  }, [originCode, destCode]);

  useEffect(() => {
    if (land.length === 0) enrichLand((l) => setLand(l));
    enrichAirports(() => setLoaded(true));
  }, [land.length]);

  const o = getAirport(originCode);
  const d = getAirport(destCode);
  const colors = theme.colors;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const cssW = canvas.clientWidth || 264;
      const cssH = canvas.clientHeight || H;
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

      // With a flight plan: frame the origin→dest arc. Without one: centre on
      // the aircraft itself at a fixed close-in zoom so every track still gets
      // a real basemap.
      let ry: number;
      let rx: number;
      let r: number;
      if (o && d) {
        const mid = gcPoint(o[0], o[1], d[0], d[1], 0.5);
        ry = Math.PI / 2 - rad(mid.lon + 180) + panRef.current.ry;
        rx = rad(mid.lat) + panRef.current.rx;
        const arcLen = gcDist(o[0], o[1], d[0], d[1]);
        r =
          Math.min(
            (frameR * 0.8) / Math.max(Math.sin(arcLen / 2), 0.05),
            frameR * 9,
          ) * zoom;
      } else {
        ry = Math.PI / 2 - rad(lon + 180) + panRef.current.ry;
        rx = rad(lat) + panRef.current.rx;
        r = frameR * 4 * zoom;
      }
      dimsRef.current.r = r;
      const proj = (la: number, lo: number) =>
        projGlobe(la, lo, cx, cy, r, ry, rx);

      // Ocean disc — clip everything that follows to the globe.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.oceanDeep;
      ctx.fill();
      ctx.clip();

      drawGrid(ctx, proj, { isFlat: false, accentColor: colors.grid });
      drawLand(ctx, proj, {
        colors,
        isFlat: false,
        horizon: { gcx: cx, gcy: cy, gr: r },
      });

      // Route: real waypoints if present, else a great circle. Split flown
      // (solid, aircraft color) from remaining (dashed, dim) at the nearest
      // route point to the aircraft.
      const stroke = (pts: [number, number][]) => {
        ctx.beginPath();
        let pen = false;
        for (const [la, lo] of pts) {
          const p = proj(la, lo);
          if (p.z > 0) {
            if (pen) ctx.lineTo(p.x, p.y);
            else { ctx.moveTo(p.x, p.y); pen = true; }
          } else pen = false;
        }
        ctx.stroke();
      };

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (o && d) {
        let routeFull: [number, number][];
        if (waypoints && waypoints.length >= 2) {
          routeFull = waypoints;
        } else {
          routeFull = [];
          for (let i = 0; i <= N; i++) {
            const g = gcPoint(o[0], o[1], d[0], d[1], i / N);
            routeFull.push([g.lat, g.lon]);
          }
        }

        let segI = 0;
        let segT = 0;
        let best = Infinity;
        for (let i = 0; i < routeFull.length - 1; i++) {
          const ax = routeFull[i]![1];
          const ay = routeFull[i]![0];
          const dx = routeFull[i + 1]![1] - ax;
          const dy = routeFull[i + 1]![0] - ay;
          const len2 = dx * dx + dy * dy;
          let t = len2 > 0 ? ((lon - ax) * dx + (lat - ay) * dy) / len2 : 0;
          t = Math.max(0, Math.min(1, t));
          const cxp = ax + t * dx;
          const cyp = ay + t * dy;
          const dd = (lon - cxp) ** 2 + (lat - cyp) ** 2;
          if (dd < best) { best = dd; segI = i; segT = t; }
        }
        const splitLat = routeFull[segI]![0] + segT * (routeFull[segI + 1]![0] - routeFull[segI]![0]);
        const splitLon = routeFull[segI]![1] + segT * (routeFull[segI + 1]![1] - routeFull[segI]![1]);
        const flown: [number, number][] = [...routeFull.slice(0, segI + 1), [splitLat, splitLon]];
        const remaining: [number, number][] = [[splitLat, splitLon], ...routeFull.slice(segI + 1)];

        ctx.strokeStyle = colors.aircraft;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        stroke(remaining);
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2;
        stroke(flown);
        ctx.globalAlpha = 1;

        if (waypoints && waypoints.length >= 2) {
          ctx.fillStyle = colors.bright;
          ctx.globalAlpha = 0.85;
          for (const [la, lo] of waypoints) {
            const p = proj(la, lo);
            if (p.z > 0) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
        }
      } else if (trail && trail.length >= 2) {
        // No flight plan: draw the recorded track as the flown line.
        ctx.strokeStyle = colors.aircraft;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2;
        stroke(trail.map((p) => [p.lat, p.lon] as [number, number]));
        ctx.globalAlpha = 1;
      }

      // Aircraft — triangle pointed along heading (screen-space tangent).
      const pa = proj(lat, lon);
      if (pa.z > 0) {
        const coslat = Math.max(0.2, Math.cos(rad(lat)));
        const ah = proj(
          lat + Math.cos(rad(heading ?? 0)) * 0.4,
          lon + (Math.sin(rad(heading ?? 0)) * 0.4) / coslat,
        );
        const ang = Math.atan2(ah.y - pa.y, ah.x - pa.x);
        ctx.save();
        ctx.translate(pa.x, pa.y);
        ctx.rotate(ang);
        ctx.fillStyle = colors.aircraft;
        ctx.strokeStyle = colors.oceanDeep;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-5, 4.5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-5, -4.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // Globe rim.
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = colors.coast;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Endpoints + labels — only with a flight plan (outside the clip so
      // labels aren't cut at the rim).
      if (o && d) {
        ctx.font = "700 11px monospace";
        ctx.textAlign = "center";
        for (const [code, coord] of [
          [originCode, o] as const,
          [destCode, d] as const,
        ]) {
          const p = proj(coord[0], coord[1]);
          if (p.z <= 0) continue;
          ctx.fillStyle = colors.dim;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = colors.text;
          ctx.fillText(code, p.x, p.y - 6);
        }
      }
    };

    // Drag to pan (rotate the little globe).
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const rr = dimsRef.current.r || 1;
      // Pan like a map: content follows the cursor on both axes.
      panRef.current.ry += (e.clientX - lx) / rr;
      panRef.current.rx = Math.max(
        -1.2,
        Math.min(1.2, panRef.current.rx + (e.clientY - ly) / rr),
      );
      lx = e.clientX;
      ly = e.clientY;
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
  }, [o, d, lat, lon, heading, waypoints, trail, land, colors, loaded, originCode, destCode, zoom]);

  const zoomBtn =
    "w-6 h-6 flex items-center justify-center rounded bg-sig-panel/80 border border-sig-border/60 text-sig-dim hover:text-sig-accent hover:border-sig-accent/50 transition-colors touch-target";

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block rounded border border-sig-border touch-none cursor-grab active:cursor-grabbing"
        aria-label="Route map — aircraft position and track over coastline"
      />

      {hud && (
        <>
          {hud.mach && <HudChip className="top-1.5 left-1.5" label="MACH" value={hud.mach} />}
          {hud.tas && <HudChip className="top-1.5 right-10" label="TAS" value={hud.tas} />}
          {hud.heading && <HudChip className="bottom-1.5 left-1.5" label="HDG" value={hud.heading} />}
          {hud.eta && <HudChip className="bottom-1.5 right-1.5" label="ETA" value={hud.eta} />}
        </>
      )}
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
        <button
          type="button"
          className={zoomBtn}
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(8, z * 1.4))}
        >
          +
        </button>
        <button
          type="button"
          className={zoomBtn}
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.5, z / 1.4))}
        >
          −
        </button>
      </div>
    </div>
  );
}

function HudChip({
  className,
  label,
  value,
}: {
  readonly className: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div
      className={`absolute z-10 bg-sig-bg/55 border border-sig-border rounded px-1.5 py-0.5 backdrop-blur-sm ${className}`}
    >
      <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim leading-none">
        {label}
      </div>
      <div className="text-(length:--sig-text-sm) text-sig-bright leading-tight">{value}</div>
    </div>
  );
}
