/// <reference lib="webworker" />
// ── Complete Rendering Web Worker ──────────────────────────────────────
// Owns an OffscreenCanvas. Renders EVERYTHING: land, ocean, grid, glow,
// rim, points, trails. Main thread only composites the finished bitmap.
// Fetches land data directly from /data/ne_50m_land.json on init.
// Per-feature render modules — bundled ESM imports (TS), not importScripts.
import { drawCyclone, drawCycloneForecastPoint, type CycloneRenderItem } from "./render/cyclones";
import { drawWarnings, type WarningFeature } from "./render/warnings";
import { zoomScale } from "./render/workerMath";
import { weatherSeverityRank } from "@/features/environmental/weather/severity";
import type { Ctx, Projected, ProjFn } from "@/features/environmental/cyclones/render/cycloneGeometry";

// ── Projection ──────────────────────────────────────────────────────

function projGlobe(
  lat: number,
  lon: number,
  cx: number,
  cy: number,
  r: number,
  ry: number,
  rx: number,
): Projected {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180 + ry;
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const x = -sp * ct;
  const y = cp;
  const z = sp * st;
  const cX = Math.cos(rx);
  const sX = Math.sin(rx);
  return { x: cx + x * r, y: cy - (y * cX - z * sX) * r, z: y * sX + z * cX };
}

function projFlat(
  lat: number,
  lon: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
): Projected {
  return { x: cx + (lon / 180) * (w / 2), y: cy - (lat / 90) * (h / 2), z: 1 };
}

function getFlatMetrics(W: number, H: number, zoom: number, panX: number, panY: number) {
  const mW = W * 0.92 * zoom;
  const mH = H * 0.84 * zoom;
  return {
    mW,
    mH,
    mx: (W - mW) / 2 + panX,
    my: (H - mH) / 2 + panY,
    cx: W / 2 + panX,
    cy: H / 2 + panY,
  };
}

// ── Interpolation ───────────────────────────────────────────────────

const DEG = Math.PI / 180;
const EARTH_R = 6371000;
type TrailEntry = { lat: number; lon: number; ts: number; speedMps: number; heading: number };
let trailMap = new Map<string, TrailEntry>();

function getInterp(id: string): { lat: number; lon: number } | null {
  const e = trailMap.get(id);
  if (!e || e.speedMps <= 0) return null;
  const elapsed = (Date.now() - e.ts) / 1000;
  // Ships (S-prefix): extrapolate up to 30 min — slow movers, AIS gaps common.
  // Aircraft: up to 10 min.
  const maxElapsed = id.startsWith("S") ? 1800 : 600;
  if (elapsed > maxElapsed || elapsed < 1) return null;
  const hdg = e.heading * DEG;
  const dist = e.speedMps * elapsed;
  const dLat = (dist * Math.cos(hdg)) / EARTH_R / DEG;
  const dLon = (dist * Math.sin(hdg)) / (EARTH_R * Math.cos(e.lat * DEG)) / DEG;
  return { lat: e.lat + dLat, lon: e.lon + dLon };
}

// ── Theme detection ─────────────────────────────────────────────────

function isLightTheme(colors: { bg?: string }): boolean {
  // Light themes have bright backgrounds.
  const [r, g, b] = parseHex(colors.bg || "#080a0f");
  return (r + g + b) / 3 > 128;
}

// ── Generic color fading — derives aged variants from the theme base ─

function parseHex(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) || 0,
    Number.parseInt(hex.slice(3, 5), 16) || 0,
    Number.parseInt(hex.slice(5, 7), 16) || 0,
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + ((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1);
}

function fadeColor(base: string, factor: number): string {
  if (factor >= 0.95) return base;
  const [r, g, b] = parseHex(base);
  return toHex(r * factor, g * factor, b * factor);
}

// ── Age/size helpers ────────────────────────────────────────────────

const HR = 3600000;
const DY = 86400000;

/** Age (ms since `ts`) → opacity factor down a stepped ramp. `steps` is
 *  [thresholdMs, factor] descending; the first threshold not exceeded wins. */
function ageFactor(ts: string | number | undefined, steps: ReadonlyArray<[number, number]>): number {
  if (!ts) return 0.5;
  const a = Date.now() - new Date(ts).getTime();
  const hit = steps.find(([threshold]) => a < threshold);
  return hit ? hit[1] : (steps.at(-1)?.[1] ?? 0.5);
}

const quakeAgeFactor = (ts?: string | number) =>
  ageFactor(ts, [[HR, 1], [6 * HR, 0.9], [DY, 0.8], [3 * DY, 0.65], [Infinity, 0.5]]);
const eventAgeFactor = (ts?: string | number) =>
  ageFactor(ts, [[HR, 1], [6 * HR, 0.9], [DY, 0.75], [3 * DY, 0.6], [Infinity, 0.45]]);
const fireAgeFactor = (ts?: string | number) =>
  ageFactor(ts, [[HR, 1], [3 * HR, 0.9], [6 * HR, 0.8], [12 * HR, 0.65], [Infinity, 0.5]]);

const quakeColor = (af: number, base: string) => fadeColor(base, af);
const eventColor = (af: number, base: string) => fadeColor(base, af);
const fireColor = (af: number, base: string) => fadeColor(base, af);

function quakeSize(m: number): number {
  const bands: ReadonlyArray<[number, number]> = [
    [1, 1.2], [2, 1.5], [3, 2], [4, 3], [5, 4.5], [6, 6], [7, 8],
  ];
  return bands.find(([max]) => m < max)?.[1] ?? 10;
}
function eventSize(s: number): number {
  const bands: ReadonlyArray<[number, number]> = [[1, 1], [2, 1.3], [3, 1.8], [4, 2.5]];
  return bands.find(([max]) => s <= max)?.[1] ?? 3.5;
}
function fireSize(frp: number): number {
  const bands: ReadonlyArray<[number, number]> = [
    [1, 0.8], [5, 1], [10, 1.3], [25, 1.8], [50, 2.5], [100, 3.5],
  ];
  return bands.find(([max]) => frp < max)?.[1] ?? 4.5;
}

// Glow baked into a per-(color,alpha) sprite once, then blitted per point —
// avoids a createRadialGradient allocation per point per frame.
const GLOW_SPRITE_PX = 128;
const glowSpriteCache = new Map<string, OffscreenCanvas>();

function getGlowSprite(color: string, alphaHex: string): OffscreenCanvas {
  const key = color + alphaHex;
  const cached = glowSpriteCache.get(key);
  if (cached) return cached;
  if (glowSpriteCache.size > 512) glowSpriteCache.clear();
  const c = new OffscreenCanvas(GLOW_SPRITE_PX, GLOW_SPRITE_PX);
  const g = c.getContext("2d")!;
  const r = GLOW_SPRITE_PX / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, color + alphaHex);
  grad.addColorStop(1, color + "00");
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW_SPRITE_PX, GLOW_SPRITE_PX);
  glowSpriteCache.set(key, c);
  return c;
}

function drawGlow(
  ctx: OffscreenCanvasRenderingContext2D,
  color: string,
  alphaHex: string,
  x: number,
  y: number,
  gr: number,
  alpha: number,
): void {
  ctx.globalAlpha = alpha;
  ctx.drawImage(getGlowSprite(color, alphaHex), x - gr, y - gr, gr * 2, gr * 2);
}

// ── Weather severity helpers ────────────────────────────────────

function weatherSize(sev: string): number {
  const r = weatherSeverityRank(sev);
  return r >= 4 ? 6 : r >= 3 ? 4.5 : r >= 2 ? 3 : r >= 1 ? 2 : 1.5;
}
function weatherAlpha(sev: string): number {
  const r = weatherSeverityRank(sev);
  return r >= 4 ? 1 : r >= 3 ? 0.9 : r >= 2 ? 0.75 : 0.6;
}

// ── Aircraft filter ─────────────────────────────────────────────────

type AircraftData = {
  onGround?: boolean;
  military?: boolean;
  recon?: boolean;
  squawk?: string;
  originCountry?: string;
};
type AircraftFilter = {
  enabled: boolean;
  showAirborne: boolean;
  showGround: boolean;
  milFilter?: string;
  squawks: string[];
  countries: string[];
};

function matchesAF(d: AircraftData, f: AircraftFilter): boolean {
  if (!f.enabled) return false;
  const onGround = d.onGround === true;
  if (!f.showAirborne && !onGround) return false;
  if (!f.showGround && onGround) return false;
  const mf = f.milFilter || "all";
  if (mf === "military" && !d.military) return false;
  if (mf === "civilian" && d.military) return false;
  if (mf === "recon" && !d.recon) return false;
  if (f.squawks.length > 0) {
    const sq = d.squawk || "";
    const bucket = ["7700", "7600", "7500"].includes(sq) ? sq : "other";
    if (!f.squawks.includes(bucket)) return false;
  }
  if (f.countries.length > 0 && !f.countries.includes(d.originCountry || "")) {
    return false;
  }
  return true;
}

// ── Land data ───────────────────────────────────────────────────────

type Ring = number[][];
let landPolygons: Ring[] = [];

function parseLandGeoJSON(geojson: { features: Array<{ geometry: { type: string; coordinates: unknown } }> }): Ring[] {
  const polys: Ring[] = [];
  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const rings: number[][][] =
      geom.type === "Polygon"
        ? (geom.coordinates as number[][][])
        : geom.type === "MultiPolygon"
          ? (geom.coordinates as number[][][][]).flat()
          : [];
    for (const ring of rings) {
      const converted = ring
        .filter((c) => c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number")
        .map((c) => [Math.round(c[1]! * 100) / 100, Math.round(c[0]! * 100) / 100]);
      if (converted.length >= 3) polys.push(converted);
    }
  }
  return polys;
}

function fetchLandData(): void {
  fetch("/data/ne_50m_land.json")
    .then((res) => res.json())
    .then((geojson) => {
      landPolygons = parseLandGeoJSON(geojson);
    })
    .catch(() => {
      /* Silent fail — land just won't render. */
    });
}

// ── Land renderer (inlined from landRenderer.ts) ────────────────────

type Pt = { x: number; y: number };

function edgeLerp(a: Projected, b: Projected): Pt {
  const t = a.z / (a.z - b.z);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function arcPts(cx: number, cy: number, r: number, a1: number, a2: number, n = 12): Pt[] {
  let diff = a2 - a1;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return Array.from({ length: n }, (_, i) => {
    const a = a1 + (diff * (i + 1)) / n;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

function findReentryPoint(pts: Projected[], startIndex: number): Pt | null {
  const n = pts.length;
  for (let j = 1; j < n; j++) {
    const prev = pts[(startIndex + j) % n];
    const next = pts[(startIndex + j + 1) % n];
    if (prev && next && prev.z <= 0 && next.z > 0) return edgeLerp(prev, next);
  }
  return null;
}

function fillStrokePath(
  ctx: Ctx,
  path: ReadonlyArray<Pt>,
  fillColor: string,
  strokeColor: string,
  landAlpha: number,
): void {
  if (path.length < 3) return;
  ctx.beginPath();
  path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = landAlpha;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = landAlpha + 0.1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawClippedPoly(
  ctx: Ctx,
  pts: Projected[],
  gcx: number,
  gcy: number,
  gr: number,
  fillColor: string,
  strokeColor: string,
  landAlpha: number,
): void {
  const n = pts.length;
  const path: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const curr = pts[i]!;
    const next = pts[(i + 1) % n]!;
    const cVis = curr.z > 0;
    const nVis = next.z > 0;
    if (cVis) path.push({ x: curr.x, y: curr.y });
    if (cVis === nVis) continue;
    if (cVis) {
      const exit = edgeLerp(curr, next);
      path.push(exit);
      const reentry = findReentryPoint(pts, i);
      if (reentry) {
        const ea = Math.atan2(exit.y - gcy, exit.x - gcx);
        const ra = Math.atan2(reentry.y - gcy, reentry.x - gcx);
        path.push(...arcPts(gcx, gcy, gr, ea, ra), reentry);
      }
    } else {
      const re = edgeLerp(curr, next);
      const last = path.at(-1) ?? null;
      if (!last || Math.abs(last.x - re.x) > 1 || Math.abs(last.y - re.y) > 1) {
        path.push(re);
      }
    }
  }
  fillStrokePath(ctx, path, fillColor, strokeColor, landAlpha);
}

function simpleDraw(
  ctx: Ctx,
  pts: ReadonlyArray<Pt>,
  fillColor: string,
  strokeColor: string,
  landAlpha: number,
): void {
  fillStrokePath(ctx, pts, fillColor, strokeColor, landAlpha);
}

type LandColors = { coastFill: string; coast: string };

function drawLandFlatPoly(ctx: Ctx, projFn: ProjFn, poly: Ring, colors: LandColors, landAlpha: number): void {
  const segments: Projected[][] = [];
  let seg: Projected[] = [];
  poly.forEach(([lat, lon], i) => {
    if (typeof lat !== "number" || typeof lon !== "number") return;
    const prevLon = poly[i - 1]?.[1];
    if (typeof prevLon === "number" && Math.abs(lon - prevLon) > 120) {
      if (seg.length >= 3) segments.push(seg);
      seg = [];
    }
    seg.push(projFn(lat, lon));
  });
  if (seg.length >= 3) segments.push(seg);
  for (const s of segments) simpleDraw(ctx, s, colors.coastFill, colors.coast, landAlpha);
}

function drawLand(
  ctx: Ctx,
  projFn: ProjFn,
  colors: LandColors,
  isFlat: boolean,
  gcx: number,
  gcy: number,
  gr: number,
  landAlpha: number,
): void {
  for (const poly of landPolygons) {
    if (isFlat) {
      if (poly.length >= 3) drawLandFlatPoly(ctx, projFn, poly, colors, landAlpha);
      continue;
    }
    const pts = poly
      .filter(([lat, lon]) => typeof lat === "number" && typeof lon === "number")
      .map(([lat, lon]) => projFn(lat!, lon!));
    if (pts.length < 3 || !pts.some((p) => p.z > 0)) continue;
    if (pts.every((p) => p.z > 0)) {
      simpleDraw(ctx, pts, colors.coastFill, colors.coast, landAlpha);
    } else {
      drawClippedPoly(ctx, pts, gcx, gcy, gr, colors.coastFill, colors.coast, landAlpha);
    }
  }
}

// ── Grid renderer (inlined from gridRenderer.ts) ────────────────────

type GridCfg = {
  accentColor?: string;
  gridAlpha?: number;
  isFlat?: boolean;
  cx?: number;
  cy?: number;
  mW?: number;
  mH?: number;
  mx?: number;
  my?: number;
};

/** Stroke a globe meridian/parallel, breaking the path where it dips behind. */
function strokeGlobeLine(ctx: Ctx, projFn: ProjFn, sample: (v: number) => Projected): void {
  ctx.beginPath();
  let on = false;
  for (let v = -180; v <= 180; v += 3) {
    const p = sample(v);
    if (p.z > 0) {
      if (on) ctx.lineTo(p.x, p.y);
      else { ctx.moveTo(p.x, p.y); on = true; }
    } else on = false;
  }
  ctx.stroke();
}

function drawGrid(ctx: Ctx, projFn: ProjFn, cfg: GridCfg): void {
  ctx.strokeStyle = cfg.accentColor || "#000";
  ctx.globalAlpha = cfg.gridAlpha || 0.11;
  ctx.lineWidth = 0.4;
  if (cfg.isFlat) {
    const { cx = 0, cy = 0, mW = 0, mH = 0, mx = 0, my = 0 } = cfg;
    for (let lat = -80; lat <= 80; lat += 20) {
      const y = cy - (lat / 90) * (mH / 2);
      ctx.beginPath();
      ctx.moveTo(mx, y);
      ctx.lineTo(mx + mW, y);
      ctx.stroke();
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const x = cx + (lon / 180) * (mW / 2);
      ctx.beginPath();
      ctx.moveTo(x, my);
      ctx.lineTo(x, my + mH);
      ctx.stroke();
    }
  } else {
    for (let lat = -80; lat <= 80; lat += 20) {
      strokeGlobeLine(ctx, projFn, (lon) => projFn(lat, lon));
    }
    for (let lon = -180; lon < 180; lon += 30) {
      // Sample range is lat −90..90; reuse the −180..180 stepper by remapping.
      ctx.beginPath();
      let on = false;
      for (let lat = -90; lat <= 90; lat += 3) {
        const p = projFn(lat, lon);
        if (p.z > 0) {
          if (on) ctx.lineTo(p.x, p.y);
          else { ctx.moveTo(p.x, p.y); on = true; }
        } else on = false;
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// ── Trail drawing ───────────────────────────────────────────────────

type TrailPoint = { lat: number; lon: number; ts?: number };
type ProjTrail = { x: number; y: number; z: number; point: TrailPoint };
type HitTarget = { x: number; y: number; point: TrailPoint };
type SelectedItem = { id: string; _trail?: TrailPoint[] };

function strokeTrailPass(ctx: Ctx, projected: ProjTrail[], width: number, base: number, span: number, color: string): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  for (let i = 1; i < projected.length; i++) {
    const prev = projected[i - 1]!;
    const curr = projected[i]!;
    ctx.globalAlpha = base + (i / projected.length) * span;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.stroke();
  }
}

function drawTrail(
  ctx: Ctx,
  projFn: ProjFn,
  selectedItem: SelectedItem | null,
  colors: { accent: string },
): HitTarget[] {
  const trail = selectedItem?._trail;
  if (!selectedItem || !trail || trail.length < 1) return [];
  const coords: TrailPoint[] = trail.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    ts: p.ts,
    altitude: p.altitude,
    speed: p.speed,
    heading: p.heading,
  }));
  const interp = getInterp(selectedItem.id);
  if (interp) coords.push({ lat: interp.lat, lon: interp.lon, ts: Date.now() });
  if (coords.length < 2) return [];

  const projected: ProjTrail[] = coords
    .map((c) => ({ p: projFn(c.lat, c.lon), point: c }))
    .filter(({ p }) => p.z > 0)
    .map(({ p, point }) => ({ x: p.x, y: p.y, z: p.z, point }));
  if (projected.length < 2) return [];

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  strokeTrailPass(ctx, projected, 6, 0.05, 0.15, colors.accent); // glow pass
  strokeTrailPass(ctx, projected, 2.5, 0.3, 0.7, colors.accent); // main line

  const hitTargets: HitTarget[] = [];
  ctx.fillStyle = "#ffffff";
  projected.slice(0, -1).forEach((p, i) => {
    ctx.globalAlpha = 0.4 + (i / projected.length) * 0.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    hitTargets.push({ x: p.x, y: p.y, point: p.point });
  });
  ctx.restore();
  return hitTargets;
}

// Planned route (decoded FlightAware waypoints, [lat,lon] pairs) for the
// selected aircraft. Split at the plane's projected point ON the route (not the
// nearest waypoint, which can sit ahead of the plane): flown is thick + solid,
// the leg ahead is thin + dashed (mirrors the dossier route map).
type RouteColors = { cyclones?: string; accent: string; bright?: string };

function drawRoute(
  ctx: Ctx,
  projFn: ProjFn,
  route: ReadonlyArray<[number, number]> | null | undefined,
  planeLat: number,
  planeLon: number,
  colors: RouteColors,
): void {
  if (!route || route.length < 2) return;

  // Closest point on the polyline to the plane → segment index + fraction.
  let segI = 0;
  let segT = 0;
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const [ay, ax] = route[i]!;
    const [by, bx] = route[i + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, len2 > 0 ? ((planeLon - ax) * dx + (planeLat - ay) * dy) / len2 : 0));
    const ex = planeLon - (ax + t * dx);
    const ey = planeLat - (ay + t * dy);
    const dd = ex * ex + ey * ey;
    if (dd < best) {
      best = dd;
      segI = i;
      segT = t;
    }
  }
  const a0 = route[segI]!;
  const a1 = route[segI + 1]!;
  const split: [number, number] = [a0[0] + segT * (a1[0] - a0[0]), a0[1] + segT * (a1[1] - a0[1])];

  const flown: Array<[number, number]> = [...route.slice(0, segI + 1), split];
  const ahead: Array<[number, number]> = [split, ...route.slice(segI + 1)];

  const strokePts = (pts: ReadonlyArray<[number, number]>) => {
    ctx.beginPath();
    let pen = false;
    for (const [lat, lon] of pts) {
      const p = projFn(lat, lon);
      if (p.z > 0) {
        if (pen) ctx.lineTo(p.x, p.y);
        else { ctx.moveTo(p.x, p.y); pen = true; }
      } else pen = false;
    }
    ctx.stroke();
  };

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = colors.cyclones || colors.accent;
  // Ahead — thin, dashed.
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([6, 4]);
  strokePts(ahead);
  // Flown — thick, solid.
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 2.75;
  strokePts(flown);

  // Waypoint markers.
  ctx.fillStyle = colors.bright || "#ffffff";
  ctx.globalAlpha = 0.95;
  for (const [lat, lon] of route) {
    const wp = projFn(lat, lon);
    if (wp.z > 0) {
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Canvas + state ──────────────────────────────────────────────────

type RenderPoint = Record<string, unknown> & { type?: string; lat?: number; lon?: number };

/** Theme palette the main thread sends with each data update. Every field is a
 *  CSS color string; the keys are the layers + chrome the worker paints. */
type WorkerColors = {
  accent: string;
  aircraft: string;
  bg: string;
  bright: string;
  coast: string;
  coastFill: string;
  cyclones: string;
  dim: string;
  events: string;
  fires: string;
  grid: string;
  ocean: string;
  oceanDeep: string;
  quakes: string;
  recon: string;
  ships: string;
  weather: string;
};

let canvas: OffscreenCanvas | null = null;
let ctx: Ctx | null = null;
let _data: RenderPoint[] | null = null;
let _colors: WorkerColors | null = null;
let _dataBySource: Record<string, RenderPoint[] | null> | null = null;
let _pendingBuckets: Record<string, RenderPoint[] | null> | null = null;
let _pendingFrame: FramePayload | null = null;
let _frameScheduled = false;

// Tropical watch/warning polygons + their fill colours, set by the "warnings"
// message and drawn each frame under the showWarnings toggle.
let _warnings: WarningFeature[] | null = null;
let _warnColor = "#ff1a6e";
let _watchColor = "#ffb300";

// NWS weather-alert polygons + severity fill colours, set by the "wxAlerts"
// message and drawn each frame under the weather layer toggle. Defaults are the
// weather violet/magenta palette so an unset frame never flashes off-palette.
let _wxAlerts: WarningFeature[] | null = null;
let _wxWarnColor = "#e64980";
let _wxWatchColor = "#9775fa";

// Progressive reveal: the main thread hands the full data array once per change;
// the worker reveals it in chunks across its own render ticks. Preserved across
// same-length updates so the ramp doesn't restart.
const REVEAL_CHUNK = 1500;
let _revealCount = 0;

// ── Message handler ─────────────────────────────────────────────────

type WorkerMsg =
  | { type: "init"; canvas: OffscreenCanvas }
  | { type: "trails"; ids?: string[]; vals?: number[]; tss?: number[]; entries?: [string, TrailEntry][] }
  | { type: "warnings"; payload: { features?: WarningFeature[]; warnColor?: string; watchColor?: string } }
  | { type: "data"; payload: { colors: WorkerColors; source?: string; reset?: boolean; data?: RenderPoint[]; done?: boolean } }
  | { type: "frame"; payload: FramePayload };

function scheduleRender(): void {
  if (!_frameScheduled && _pendingFrame) {
    _frameScheduled = true;
    requestAnimationFrame(renderFrame);
  }
}

function handleTrails(msg: Extract<WorkerMsg, { type: "trails" }>): void {
  if (msg.ids && msg.vals && msg.tss) {
    const { ids, vals: v, tss: ts } = msg;
    trailMap = new Map(
      ids.map((id, ti) => {
        const o = ti * 4;
        return [id, { lat: v[o]!, lon: v[o + 1]!, heading: v[o + 2]!, speedMps: v[o + 3]!, ts: ts[ti]! }] as const;
      }),
    );
  } else {
    trailMap = new Map(msg.entries ?? []);
  }
}

function handleData(payload: Extract<WorkerMsg, { type: "data" }>["payload"]): boolean {
  _colors = payload.colors;
  if (payload.source !== undefined) {
    _dataBySource ??= {};
    _pendingBuckets ??= {};
    const src = payload.source;
    if (payload.reset) _pendingBuckets[src] = [];
    const pend = _pendingBuckets[src] ?? (_pendingBuckets[src] = []);
    pend.push(...(payload.data ?? []));
    if (!payload.done) return false; // keep the old bucket until the layer is whole
    _dataBySource[src] = _pendingBuckets[src];
    _pendingBuckets[src] = null;
    _data = Object.values(_dataBySource).filter((b): b is RenderPoint[] => Boolean(b)).flat();
  } else {
    _data = payload.data ?? null;
  }
  const len = _data?.length ?? 0;
  if (_revealCount > len) _revealCount = len;
  if (_revealCount === 0 && len > 0) _revealCount = Math.min(REVEAL_CHUNK, len);
  return true;
}

globalThis.onmessage = (e: MessageEvent<WorkerMsg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    canvas = msg.canvas;
    ctx = canvas.getContext("2d");
    if (landPolygons.length === 0) fetchLandData();
    return;
  }
  if (msg.type === "trails") {
    handleTrails(msg);
    return;
  }
  if (msg.type === "warnings") {
    _warnings = msg.payload.features || null;
    if (msg.payload.warnColor) _warnColor = msg.payload.warnColor;
    if (msg.payload.watchColor) _watchColor = msg.payload.watchColor;
    scheduleRender();
    return;
  }
  if (msg.type === "wxAlerts") {
    _wxAlerts = msg.payload.features || null;
    if (msg.payload.warnColor) _wxWarnColor = msg.payload.warnColor;
    if (msg.payload.watchColor) _wxWatchColor = msg.payload.watchColor;
    scheduleRender();
    return;
  }
  if (msg.type === "data") {
    if (handleData(msg.payload)) scheduleRender();
    return;
  }
  if (msg.type === "frame") {
    _pendingFrame = msg.payload;
    if (!_frameScheduled) {
      _frameScheduled = true;
      requestAnimationFrame(renderFrame);
    }
    return;
  }
};

// ── Render everything ───────────────────────────────────────────────

type Cam = {
  zoomFlat: number;
  zoomGlobe: number;
  panX: number;
  panY: number;
  rotY: number;
  rotX: number;
};
type FramePayload = {
  W: number;
  H: number;
  dpr: number;
  isFlat: boolean;
  cam: Cam;
  t: number;
  selectedId?: string;
  isolatedId?: string;
  isolateMode?: string;
  layers: Record<string, boolean | undefined>;
  aircraftFilter: AircraftFilter;
  searchMatchIds?: string[];
  selectedItem?: (SelectedItem & RenderPoint) | null;
  cyclonesShowForecast?: boolean;
  cyclonesShowCone?: boolean;
  cyclonesShowWindField?: boolean;
  cyclonesShowWarnings?: boolean;
  cyclonesShowModels?: boolean;
  cyclonesHiddenModels?: string[];
  prefersReducedMotion?: boolean;
};

// ── Per-type point drawing (extracted from the render loop) ─────────

type DotEnv = { ctx: Ctx; t: number; zoomLevel: number };

/** Selection ring shared by every point type. */
function drawSelectionRing(ctx: Ctx, x: number, y: number, s: number, color: string, t: number): void {
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
  ctx.stroke();
}

type PulseGlow = { idSliceFrom: number; rate: number; baseAmp: number; ampGain: number; radBase: number; radGain: number; alphaHex: string; glowMul: number };

/** Shared pulsing-dot renderer for quakes / events / fires / weather. `shape`
 *  draws the marker (circle vs diamond). Returns nothing; mutates the canvas. */
function drawPulsingDot(
  env: DotEnv,
  x: number,
  y: number,
  s: number,
  color: string,
  fillAlpha: number,
  isSel: boolean,
  glow: { intensity: number; pulseIndex: number; id: string; cfg: PulseGlow } | null,
  shape: (s: number) => void,
): void {
  const { ctx, t } = env;
  if (glow && glow.intensity > 0.01) {
    const { pulseIndex: pi, id, cfg } = glow;
    const pulse = 1 + Math.sin(t + (Number.parseInt(id.slice(cfg.idSliceFrom), 36) || 0) * cfg.rate) * (cfg.baseAmp + pi * cfg.ampGain);
    const gr = s * (cfg.radBase + pi * cfg.radGain) * pulse;
    drawGlow(ctx, color, cfg.alphaHex, x, y, gr, fillAlpha * glow.intensity * cfg.glowMul);
  }
  ctx.globalAlpha = fillAlpha;
  ctx.fillStyle = color;
  shape(s);
  ctx.fill();
  if (isSel) drawSelectionRing(ctx, x, y, s, color, t);
  ctx.globalAlpha = 1;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

type ProjPoint = { x: number; y: number; z: number; item: RenderPoint };

const POINT_LAYER_ORDER: Record<string, number> = {
  aircraft: 0, ships: 1, fires: 2, events: 3, quakes: 4, weather: 5, "cyclones-forecast": 6, cyclones: 7,
};

type FilterCfg = {
  searchSet: Set<string> | null;
  isoMode: string | undefined;
  isoId: string | undefined;
  isolatedType: string | null;
  layers: Record<string, boolean | undefined>;
  af: AircraftFilter;
  showForecast: boolean;
};

/** Does one item survive the search / isolation / layer filters? */
function pointPassesFilters(item: RenderPoint, c: FilterCfg): boolean {
  if (c.searchSet && !c.searchSet.has(item.id as string)) return false;
  if (c.isoMode === "solo" && item.id !== c.isoId) return false;
  if (c.isoMode === "focus" && c.isolatedType && item.type !== c.isolatedType) return false;
  if (item.type === "aircraft") return matchesAF(item.data as AircraftData, c.af);
  if (item.type === "cyclones-forecast") return c.layers.cyclones !== false && c.showForecast !== false;
  return c.layers[item.type as string] !== false;
}

/** Project every visible item to screen space, drop back-facing points, and
 *  sort by layer order so markers stack correctly. */
function projectAndFilter(data: ReadonlyArray<RenderPoint>, projFn: ProjFn, c: FilterCfg): ProjPoint[] {
  const pts: ProjPoint[] = [];
  for (const item of data) {
    if (!pointPassesFilters(item, c)) continue;
    let lat = item.lat ?? 0;
    let lon = item.lon ?? 0;
    if (item.type === "aircraft" || item.type === "ships") {
      const interp = getInterp(item.id as string);
      if (interp) { lat = interp.lat; lon = interp.lon; }
    }
    const pt = projFn(lat, lon);
    if (pt.z <= 0) continue;
    pts.push({ x: pt.x, y: pt.y, z: pt.z, item });
  }
  if (pts.length > 1) {
    pts.sort((a, b) => (POINT_LAYER_ORDER[a.item.type ?? ""] ?? 0) - (POINT_LAYER_ORDER[b.item.type ?? ""] ?? 0));
  }
  return pts;
}

type PointDrawCtx = {
  ctx: Ctx;
  projFn: ProjFn;
  colorMap: Record<string, string>;
  accent: string;
  selId: string | undefined;
  t: number;
  zoomLevel: number;
  milColor: string;
  reconColor: string;
  showForecast: boolean;
  showCone: boolean;
  showWindField: boolean;
  showModels: boolean;
  hiddenModels: ReadonlySet<string>;
  reducedMotion: boolean;
};

/** Draw one projected point by its type. Each branch returns after drawing. */
function drawPoint(pc: PointDrawCtx, pt: ProjPoint): void {
  const { ctx, projFn, colorMap, accent, selId, t, zoomLevel, milColor, reconColor } = pc;
  const { x, y, z, item } = pt;
  const d = (item.data ?? {}) as Record<string, unknown>;
  const baseColor = colorMap[item.type ?? ""] || accent;
  const depthAlpha = 0.4 + z * 0.6;
  const isSel = item.id === selId;
  const id = (item.id as string) ?? "";
  const ts = item.timestamp as string | undefined;
  const env: DotEnv = { ctx, t, zoomLevel };
  const circle = (s: number) => { ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); };

  if (item.type === "quakes") {
    const mag = (d.magnitude as number) || 0;
    const af2 = quakeAgeFactor(ts);
    const color = quakeColor(af2, baseColor);
    const s = quakeSize(mag) * zoomScale(zoomLevel) * (isSel ? 2 : 1);
    drawPulsingDot(env, x, y, s, color, depthAlpha * af2 * 0.8, isSel,
      mag > 3 ? { intensity: clamp01((zoomLevel - 1.3) / 2), pulseIndex: Math.min(1, (mag - 3) / 4), id, cfg: { idSliceFrom: 1, rate: 0.7, baseAmp: 0.1, ampGain: 0.2, radBase: 1.8, radGain: 1.5, alphaHex: "40", glowMul: 0.5 } } : null,
      circle);
    return;
  }

  if (item.type === "events") {
    const sev = (d.severity as number) || 1;
    const af2 = eventAgeFactor(ts);
    const color = eventColor(af2, baseColor);
    const s = eventSize(sev) * zoomScale(zoomLevel) * (isSel ? 2 : 1);
    drawPulsingDot(env, x, y, s, color, depthAlpha * af2 * 0.75, isSel,
      sev >= 3 ? { intensity: clamp01((zoomLevel - 1.3) / 2), pulseIndex: Math.min(1, (sev - 2) / 3), id, cfg: { idSliceFrom: 2, rate: 0.5, baseAmp: 0.1, ampGain: 0.2, radBase: 1.8, radGain: 1.2, alphaHex: "30", glowMul: 0.4 } } : null,
      circle);
    return;
  }

  if (item.type === "fires") {
    const frp = (d.frp as number) || 0;
    const af2 = fireAgeFactor(ts);
    const color = fireColor(af2, baseColor);
    const s = fireSize(frp) * zoomScale(zoomLevel) * (isSel ? 2 : 1);
    drawPulsingDot(env, x, y, s, color, depthAlpha * af2 * 0.5, isSel,
      frp > 15 ? { intensity: clamp01((zoomLevel - 1.5) / 2.5), pulseIndex: Math.min(1, (frp - 15) / 85), id, cfg: { idSliceFrom: 2, rate: 0.6, baseAmp: 0.05, ampGain: 0.15, radBase: 1.5, radGain: 1.5, alphaHex: "30", glowMul: 0.35 } } : null,
      circle);
    return;
  }

  if (item.type === "weather") {
    const wsev = (d.severity as string) || "Unknown";
    const wrank = weatherSeverityRank(wsev);
    const s = weatherSize(wsev) * zoomScale(zoomLevel) * (isSel ? 2 : 1);
    const diamond = (sz: number) => {
      ctx.beginPath();
      ctx.moveTo(x, y - sz * 1.2);
      ctx.lineTo(x + sz * 0.8, y);
      ctx.lineTo(x, y + sz * 1.2);
      ctx.lineTo(x - sz * 0.8, y);
      ctx.closePath();
    };
    drawPulsingDot(env, x, y, s, baseColor, depthAlpha * weatherAlpha(wsev) * 0.8, isSel,
      wrank >= 3 ? { intensity: clamp01((zoomLevel - 1.3) / 2), pulseIndex: Math.min(1, (wrank - 2) / 2), id, cfg: { idSliceFrom: 2, rate: 0.5, baseAmp: 0.1, ampGain: 0.2, radBase: 1.8, radGain: 1.5, alphaHex: "30", glowMul: 0.4 } } : null,
      diamond);
    return;
  }

  if (item.type === "cyclones") {
    // Trust-boundary narrow: the main thread sends cyclone points in CycloneRenderItem
    // shape; the worker's heterogeneous RenderPoint can't express that statically.
    const storm = item as unknown as CycloneRenderItem;
    drawCyclone(ctx, projFn, x, y, storm, baseColor, depthAlpha, t, isSel, {
      showForecast: pc.showForecast,
      showCone: pc.showCone,
      showWindField: pc.showWindField,
      showModels: pc.showModels,
      hiddenModels: pc.hiddenModels,
      reducedMotion: pc.reducedMotion,
    });
    return;
  }

  if (item.type === "cyclones-forecast") {
    drawCycloneForecastPoint(ctx, x, y, (d.fcstHour as number) || 0,
      colorMap.cyclones || baseColor, depthAlpha,
      { isSelected: isSel, t, reducedMotion: pc.reducedMotion });
    return;
  }

  if (item.type === "ships") {
    const shipAlpha = Math.min(0.85, 0.35 + Math.max(0, (zoomLevel - 1) / 2) * 0.5);
    const s = 2.5 * zoomScale(zoomLevel) * (isSel ? 2 : 1);
    const a = (((d.heading as number) || 0) * Math.PI) / 180;
    const hw = s * 0.7;
    ctx.globalAlpha = depthAlpha * shipAlpha;
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a) * s * 1.4, y - Math.cos(a) * s * 1.4);
    ctx.lineTo(x + Math.sin(a + Math.PI / 2) * hw, y - Math.cos(a + Math.PI / 2) * hw);
    ctx.lineTo(x + Math.sin(a + Math.PI) * s * 0.8, y - Math.cos(a + Math.PI) * s * 0.8);
    ctx.lineTo(x + Math.sin(a - Math.PI / 2) * hw, y - Math.cos(a - Math.PI / 2) * hw);
    ctx.closePath();
    ctx.fill();
    if (isSel) drawSelectionRing(ctx, x, y, s, baseColor, t);
    ctx.globalAlpha = 1;
    return;
  }

  // Aircraft. Recon (Hurricane Hunter) outranks military.
  const isMil = Boolean(d.military);
  const isRecon = Boolean(d.recon);
  let acAlpha = Math.min(0.8, 0.2 + Math.max(0, (zoomLevel - 1) / 5) * 0.6);
  if (isMil) acAlpha = Math.min(0.9, acAlpha + 0.15);
  if (isRecon) acAlpha = Math.min(1, Math.max(acAlpha, 0.75) + 0.1);
  let acSize = Math.min(4, 1 + Math.max(0, (zoomLevel - 1) * 0.5));
  if (isMil) acSize = Math.min(5, acSize * 1.2);
  if (isRecon) acSize = Math.max(acSize, 2.2) * 1.2;
  if (isSel) acSize *= 2;
  const status = d.squawkStatus as string | undefined;
  const isEmergency = status === "emergency" || status === "radio_failure" || status === "hijack";
  ctx.globalAlpha = isEmergency ? depthAlpha : depthAlpha * acAlpha;
  // Colour precedence: emergency → recon → military → base.
  const acColor =
    status === "emergency" ? "#ff3333"
      : status === "radio_failure" ? "#ff8800"
        : status === "hijack" ? "#cc44ff"
          : isRecon ? reconColor
            : isMil ? milColor
              : baseColor;
  ctx.fillStyle = acColor;
  const a = (((d.heading as number) || 0) * Math.PI) / 180;
  const s = acSize;
  ctx.beginPath();
  ctx.moveTo(x + Math.sin(a) * s * 1.6, y - Math.cos(a) * s * 1.6);
  ctx.lineTo(x + Math.sin(a + 2.4) * s, y - Math.cos(a + 2.4) * s);
  ctx.lineTo(x + Math.sin(a - 2.4) * s, y - Math.cos(a - 2.4) * s);
  ctx.closePath();
  ctx.fill();
  if (isSel) drawSelectionRing(ctx, x, y, s, isMil ? milColor : baseColor, t);
}

type StaticLayerCtx = {
  ctx: Ctx;
  projFn: ProjFn;
  colors: WorkerColors;
  isFlat: boolean;
  W: number;
  H: number;
  cx: number;
  cy: number;
  globeR: number;
  fm: ReturnType<typeof getFlatMetrics> | null;
  landAlpha: number;
  gridAlpha: number;
  glowAlpha: string;
};

/** Ocean + land + grid backdrop, clipped to the globe disc / flat map rect.
 *  Leaves the clip active (caller restores) so points draw inside it. */
function drawStaticLayer(s: StaticLayerCtx): void {
  const { ctx, projFn, colors, cx, cy, globeR, landAlpha, gridAlpha } = s;
  if (!s.isFlat) {
    const r = globeR;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.4);
    glow.addColorStop(0, colors.accent + s.glowAlpha);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, s.W, s.H);

    const bg = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
    bg.addColorStop(0, colors.ocean || "#0e1825");
    bg.addColorStop(1, colors.oceanDeep || "#060c16");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.clip();
    drawLand(ctx, projFn, colors, false, cx, cy, r - 0.5, landAlpha);
    drawGrid(ctx, projFn, { isFlat: false, accentColor: colors.grid || colors.accent, gridAlpha });
    return;
  }
  const fm = s.fm!;
  ctx.fillStyle = colors.oceanDeep || "#081018";
  ctx.fillRect(fm.mx, fm.my, fm.mW, fm.mH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(fm.mx, fm.my, fm.mW, fm.mH);
  ctx.clip();
  drawLand(ctx, projFn, colors, true, 0, 0, 0, landAlpha);
  drawGrid(ctx, projFn, {
    isFlat: true, cx, cy, mW: fm.mW, mH: fm.mH, mx: fm.mx, my: fm.my,
    accentColor: colors.grid || colors.accent, gridAlpha,
  });
}

function renderFrame(): void {
  _frameScheduled = false;
  // Keep the last frame payload (don't null it) so the reveal ramp re-renders
  // with the last camera between "frame" messages.
  if (!canvas || !ctx || !_data || !_colors || !_pendingFrame) return;

  const p = _pendingFrame;
  const { W, H, dpr, isFlat, cam, t } = p;
  const selId = p.selectedId;
  const isoId = p.isolatedId;
  const isoMode = p.isolateMode;
  const { layers, aircraftFilter: af } = p;
  const colors = _colors;

  // Progressive reveal: advance the counter each frame and slice to it.
  const fullData = _data;
  if (_revealCount < fullData.length) {
    _revealCount = Math.min(_revealCount + REVEAL_CHUNK, fullData.length);
  } else if (_revealCount > fullData.length) {
    _revealCount = fullData.length;
  }
  const data = _revealCount < fullData.length ? fullData.slice(0, _revealCount) : fullData;
  const searchIds = p.searchMatchIds;
  const selectedItem = p.selectedItem;

  const zoomLevel = isFlat ? cam.zoomFlat : cam.zoomGlobe;
  const light = isLightTheme(colors);
  const landAlpha = light ? 0.9 : 0.7;
  const gridAlpha = light ? 0.18 : 0.11;
  const glowAlpha = light ? "08" : "0d";

  const cw = Math.round(W * dpr);
  const ch = Math.round(H * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const colorMap: Record<string, string> = {
    ships: colors.ships,
    aircraft: colors.aircraft,
    events: colors.events,
    quakes: colors.quakes,
    fires: colors.fires || "#ff6600",
    weather: colors.weather || "#aa66ff",
    cyclones: colors.cyclones || "#ff66cc",
  };

  // Cyclone filter + reduced-motion flags from the frame payload.
  const cyclonesShowForecast = p.cyclonesShowForecast !== false;
  const cyclonesShowCone = p.cyclonesShowCone !== false;
  const cyclonesShowWindField = p.cyclonesShowWindField === true; // default off
  const cyclonesShowWarnings = p.cyclonesShowWarnings !== false;
  const cyclonesShowModels = p.cyclonesShowModels === true; // default off
  const cyclonesHiddenModels = new Set(p.cyclonesHiddenModels ?? []);
  const reducedMotion = p.prefersReducedMotion === true;

  const milColor = light ? "#3a3a3a" : "#e0e0e0";
  const reconColor = colors.recon || (light ? "#b86b00" : "#ff9500");

  const fm = isFlat ? getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY) : null;
  const globeR = Math.min(W, H) * 0.4 * cam.zoomGlobe;
  const projFn: ProjFn = fm
    ? (lat, lon) => projFlat(lat, lon, fm.cx, fm.cy, fm.mW, fm.mH)
    : (lat, lon) => projGlobe(lat, lon, cx, cy, globeR, cam.rotY, cam.rotX);

  // ── Draw static layer (leaves clip active for the points) ─────
  drawStaticLayer({ ctx, projFn, colors, isFlat, W, H, cx, cy, globeR, fm, landAlpha, gridAlpha, glowAlpha });

  // ── Tropical watch/warning areas (under the storm marker/track) ──
  if (cyclonesShowWarnings && _warnings && _warnings.length > 0) {
    const gr = isFlat ? 0 : globeR - 0.5;
    drawWarnings(
      { ctx, proj: projFn, isFlat, gcx: cx, gcy: cy, gr, prims: { simpleDraw, drawClippedPoly } },
      _warnings,
      { warn: _warnColor, watch: _watchColor },
      selId ?? null,
      t,
    );
  }

  // ── NWS weather-alert areas (under the markers, gated by the layer toggle) ──
  if (layers.weather !== false && _wxAlerts && _wxAlerts.length > 0) {
    const gr = isFlat ? 0 : globeR - 0.5;
    drawWarnings(
      { ctx, proj: projFn, isFlat, gcx: cx, gcy: cy, gr, prims: { simpleDraw, drawClippedPoly } },
      _wxAlerts,
      { warn: _wxWarnColor, watch: _wxWatchColor },
      selId ?? null,
      t,
    );
  }

  // ── Project + filter points ───────────────────────────────────
  const isolatedType =
    isoId && selId ? (data.find((d) => d.id === isoId)?.type ?? null) : null;
  const searchSet = searchIds ? new Set(searchIds) : null;
  const filterCfg: FilterCfg = { searchSet, isoMode, isoId, isolatedType, layers, af, showForecast: cyclonesShowForecast };
  const pts = projectAndFilter(data, projFn, filterCfg);

  // ── Draw trail (only if the selected item passes current filters) ──
  const selPassesFilters = (): boolean => {
    if (!selectedItem) return false;
    if (searchSet && !searchSet.has(selectedItem.id)) return false;
    if (isoMode === "solo" && selectedItem.id !== isoId) return false;
    if (isoMode === "focus" && isolatedType && selectedItem.type !== isolatedType) return false;
    if (selectedItem.type === "aircraft") {
      const fullItem = data.find((d) => d.id === selectedItem.id);
      return Boolean(fullItem && matchesAF((fullItem.data as AircraftData) || {}, af));
    }
    return layers[selectedItem.type ?? ""] !== false;
  };
  const drawSelectedTrail = selPassesFilters();

  if (drawSelectedTrail && selectedItem && (selectedItem as RenderPoint)._route) {
    const routePos = getInterp(selectedItem.id);
    drawRoute(
      ctx,
      projFn,
      (selectedItem as RenderPoint)._route as [number, number][],
      routePos ? routePos.lat : (selectedItem.lat as number),
      routePos ? routePos.lon : (selectedItem.lon as number),
      colors,
    );
  }
  const hitTargets = drawSelectedTrail ? drawTrail(ctx, projFn, selectedItem ?? null, colors) : [];
  ctx.globalAlpha = 1;

  // ── Draw points ───────────────────────────────────────────────
  const pointCtx: PointDrawCtx = {
    ctx, projFn, colorMap, accent: colors.accent, selId, t, zoomLevel, milColor, reconColor,
    showForecast: cyclonesShowForecast, showCone: cyclonesShowCone,
    showWindField: cyclonesShowWindField, showModels: cyclonesShowModels,
    hiddenModels: cyclonesHiddenModels, reducedMotion,
  };
  for (const pt of pts) drawPoint(pointCtx, pt);
  ctx.globalAlpha = 1;

  // ── Restore clip and draw rim/border ──────────────────────────
  ctx.restore();

  if (!isFlat) {
    ctx.beginPath();
    ctx.arc(cx, cy, globeR, 0, Math.PI * 2);
    ctx.strokeStyle = colors.accent + (light ? "30" : "1f");
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (fm) {
    ctx.strokeStyle = colors.accent + (light ? "25" : "1a");
    ctx.lineWidth = 1;
    ctx.strokeRect(fm.mx, fm.my, fm.mW, fm.mH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.dim || colors.accent;
    const baseFontSize = Math.max(8, Math.min(W, H) * 0.015);
    ctx.font = `${baseFontSize}px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center";
    for (let lon = -120; lon <= 120; lon += 60) {
      ctx.fillText(`${Math.abs(lon)}\u00B0${lon >= 0 ? "E" : "W"}`, fm.cx + (lon / 180) * (fm.mW / 2), fm.my + fm.mH + 13);
    }
    ctx.textAlign = "right";
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.fillText(`${Math.abs(lat)}\u00B0${lat >= 0 ? "N" : "S"}`, fm.mx - 5, fm.cy - (lat / 90) * (fm.mH / 2) + 3);
    }
  }

  const bitmap = canvas.transferToImageBitmap();
  globalThis.postMessage({ type: "frame", bitmap, hitTargets }, [bitmap]);

  // Reveal ramp not finished — schedule another frame so it keeps filling in
  // even if no new "frame" message arrives (still camera).
  if (_data && _revealCount < _data.length && !_frameScheduled) {
    _frameScheduled = true;
    requestAnimationFrame(renderFrame);
  }
}
