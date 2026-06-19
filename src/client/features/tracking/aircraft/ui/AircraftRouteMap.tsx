// ── AircraftRouteMap ─────────────────────────────────────────────────
// Origin → destination view on an orthographic globe centered on the route.
// Rendering reuses the globe's own canvas renderers — drawLand (horizon
// clipping + theme coastFill/coast) and drawGrid — with projGlobe, so the land
// matches the main globe instead of a hand-rolled copy. Only the route geometry
// (great-circle math) and the route/aircraft overlay live here.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getLand, enrichLand } from "@/lib/landService";
import { getAirport, enrichAirports } from "@/lib/airportService";
import { projGlobe } from "@/components/globe/projection";
import { drawLand } from "@/components/globe/landRenderer";
import { drawGrid } from "@/components/globe/gridRenderer";

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

export function AircraftRouteMap({
  originCode,
  destCode,
  lat,
  lon,
  heading,
  waypoints,
  fallback,
}: {
  readonly originCode: string;
  readonly destCode: string;
  readonly lat: number;
  readonly lon: number;
  readonly heading?: number;
  readonly waypoints?: [number, number][];
  readonly fallback?: ReactNode;
}) {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef({ ry: 0, rx: 0 });
  const dimsRef = useRef({ r: 1 });
  const [land, setLand] = useState<number[][][]>(() => getLand());
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
    if (!canvas || !o || !d) return;

    const draw = () => {
      const cssW = canvas.clientWidth || 264;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(H * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, H);

      const mid = gcPoint(o[0], o[1], d[0], d[1], 0.5);
      const ry = Math.PI / 2 - rad(mid.lon + 180) + panRef.current.ry;
      const rx = rad(mid.lat) + panRef.current.rx;
      const cx = cssW / 2;
      const cy = H / 2;
      const frameR = Math.min(cssW, H) / 2 - PAD;
      const arcLen = gcDist(o[0], o[1], d[0], d[1]);
      const r =
        Math.min(
          (frameR * 0.8) / Math.max(Math.sin(arcLen / 2), 0.05),
          frameR * 9,
        ) * zoom;
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
      drawLand(ctx, proj, colors, false, cx, cy, r);

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

      // Split at the plane's projected point ON the route (not the nearest
      // waypoint, which can sit ahead of the plane).
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
      const flown: [number, number][] = [
        ...routeFull.slice(0, segI + 1),
        [splitLat, splitLon],
      ];
      const remaining: [number, number][] = [
        [splitLat, splitLon],
        ...routeFull.slice(segI + 1),
      ];

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = colors.aircraft;
      // Remaining — same yellow, faint + dashed (never grey).
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      stroke(remaining);
      ctx.setLineDash([]);
      // Flown — solid, full-strength yellow.
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2;
      stroke(flown);
      ctx.globalAlpha = 1;

      // Waypoint markers — real decoded waypoints only.
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

      // Endpoints + labels (outside the clip so labels aren't cut at the rim).
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
  }, [o, d, lat, lon, heading, waypoints, land, colors, loaded, originCode, destCode, zoom]);

  if (!o || !d) {
    if (loaded && fallback) return <>{fallback}</>;
    return (
      <div
        className="w-full rounded border border-sig-border flex items-center justify-center text-sig-dim text-(length:--sig-text-sm)"
        style={{ height: "12.5rem", background: "var(--sigint-oceanDeep, #0a1420)" }}
      >
        {loaded ? "route position unavailable" : "loading route…"}
      </div>
    );
  }

  const zoomBtn =
    "w-6 h-6 flex items-center justify-center rounded bg-sig-panel/80 border border-sig-border/60 text-sig-dim hover:text-sig-accent hover:border-sig-accent/50 transition-colors touch-target";

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        className="w-full block rounded border border-sig-border touch-none cursor-grab active:cursor-grabbing"
        style={{ height: "12.5rem" }}
        aria-label="Route map — origin to destination over coastline"
      />
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
