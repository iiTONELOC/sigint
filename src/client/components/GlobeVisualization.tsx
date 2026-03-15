import { getLand, enrichLand } from "@/lib/landService";
import { getInterpolatedPosition, getTrail } from "@/lib/trailService";
import { useEffect, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors } from "@/config/theme";
import type { DataPoint } from "@/features/base/dataPoints";
import { matchesAircraftFilter } from "@/features/aircraft";
import type { AircraftFilter } from "@/features/aircraft";

interface GlobeVisualizationProps {
  readonly flat?: boolean;
  readonly autoRotate?: boolean;
  readonly rotationSpeed?: number;
  readonly data: DataPoint[];
  readonly layers: Record<string, boolean>;
  readonly aircraftFilter: AircraftFilter;
  readonly selected: DataPoint | null;
  readonly isolatedId: string | null;
  readonly isolateMode: null | "solo" | "focus";
  readonly onSelect: (item: DataPoint | null) => void;
  readonly onRawCanvasClick?: () => void;
  readonly onMiddleClick?: () => void;
  readonly zoomToId?: string | null;
  readonly searchMatchIds?: Set<string> | null;
}

interface Projected {
  x: number;
  y: number;
  z: number;
}

type ProjFn = (lat: number, lon: number) => Projected;

function getFlatMetrics(
  W: number,
  H: number,
  zoom: number,
  panX: number = 0,
  panY: number = 0,
) {
  const mW = W * 0.92 * zoom;
  const mH = H * 0.84 * zoom;
  const mx = (W - mW) / 2 + panX;
  const my = (H - mH) / 2 + panY;
  const cx = W / 2 + panX;
  const cy = H / 2 + panY;
  return { mW, mH, mx, my, cx, cy };
}

function clampFlatPan(
  cam: { zoomFlat: number; panX: number; panY: number },
  W: number,
  H: number,
) {
  const mW = W * 0.92 * cam.zoomFlat;
  const mH = H * 0.84 * cam.zoomFlat;
  const maxX = Math.max(0, (mW - W) / 2);
  const maxY = Math.max(0, (mH - H) / 2);
  cam.panX = Math.max(-maxX, Math.min(maxX, cam.panX));
  cam.panY = Math.max(-maxY, Math.min(maxY, cam.panY));
}

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
  const x = -Math.sin(phi) * Math.cos(theta);
  const y = Math.cos(phi);
  const z = Math.sin(phi) * Math.sin(theta);
  const cX = Math.cos(rx),
    sX = Math.sin(rx);
  const y2 = y * cX - z * sX;
  const z2 = y * sX + z * cX;
  return { x: cx + x * r, y: cy - y2 * r, z: z2 };
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

function edgeLerp(a: Projected, b: Projected): { x: number; y: number } {
  const t = a.z / (a.z - b.z);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function arcPts(
  cx: number,
  cy: number,
  r: number,
  a1: number,
  a2: number,
  n: number = 12,
): { x: number; y: number }[] {
  let diff = a2 - a1;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  const out: { x: number; y: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const a = a1 + (diff * i) / n;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

function findReentryPoint(
  pts: Projected[],
  startIndex: number,
): { x: number; y: number } | null {
  const n = pts.length;
  for (let j = 1; j < n; j++) {
    const pi = (startIndex + j) % n;
    const ni = (startIndex + j + 1) % n;
    const pCurr = pts[pi];
    const pNext = pts[ni];
    if (!pCurr || !pNext) continue;
    if (pCurr.z <= 0 && pNext.z > 0) {
      return edgeLerp(pCurr, pNext);
    }
  }
  return null;
}

type HorizonCircle = {
  gcx: number;
  gcy: number;
  gr: number;
};

function appendHorizonArc(
  path: { x: number; y: number }[],
  exit: { x: number; y: number },
  reentry: { x: number; y: number },
  horizon: HorizonCircle,
) {
  const { gcx, gcy, gr } = horizon;
  const ea = Math.atan2(exit.y - gcy, exit.x - gcx);
  const ra = Math.atan2(reentry.y - gcy, reentry.x - gcx);
  for (const ap of arcPts(gcx, gcy, gr, ea, ra)) path.push(ap);
  path.push(reentry);
}

function handleExitTransition(
  path: { x: number; y: number }[],
  curr: Projected,
  next: Projected,
  pts: Projected[],
  index: number,
  horizon: HorizonCircle,
) {
  const exit = edgeLerp(curr, next);
  path.push(exit);
  const reentry = findReentryPoint(pts, index);
  if (!reentry) return;
  appendHorizonArc(path, exit, reentry, horizon);
}

function handleReentryTransition(
  path: { x: number; y: number }[],
  curr: Projected,
  next: Projected,
) {
  const re = edgeLerp(curr, next);
  const last = path.at(-1);
  if (!last || Math.abs(last.x - re.x) > 1 || Math.abs(last.y - re.y) > 1) {
    path.push(re);
  }
}

function drawClippedPoly(
  ctx: CanvasRenderingContext2D,
  pts: Projected[],
  gcx: number,
  gcy: number,
  gr: number,
  fillColor: string,
  strokeColor: string,
) {
  const n = pts.length;
  const path: { x: number; y: number }[] = [];
  const horizon: HorizonCircle = { gcx, gcy, gr };

  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    if (!curr || !next) continue;
    const cVis = curr.z > 0;
    const nVis = next.z > 0;

    if (cVis) path.push({ x: curr.x, y: curr.y });
    if (cVis === nVis) continue;

    if (cVis) handleExitTransition(path, curr, next, pts, i, horizon);
    else handleReentryTransition(path, curr, next);
  }

  if (path.length < 3) return;
  const first = path[0];
  if (!first) return;

  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < path.length; i++) {
    const point = path[i];
    if (!point) continue;
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function simpleDraw(
  ctx: CanvasRenderingContext2D,
  pts: Projected[],
  fillColor: string,
  strokeColor: string,
) {
  const first = pts[0];
  if (!first) return;

  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const point = pts[i];
    if (!point) continue;
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawLand(
  ctx: CanvasRenderingContext2D,
  proj: ProjFn,
  colors: ThemeColors,
  isFlat: boolean,
  gcx: number,
  gcy: number,
  gr: number,
) {
  getLand().forEach((poly) => {
    const pts: Projected[] = poly.reduce<Projected[]>((acc, coord) => {
      const [lat, lon] = coord;
      if (typeof lat !== "number" || typeof lon !== "number") return acc;
      acc.push(proj(lat, lon));
      return acc;
    }, []);

    if (pts.length < 3) return;

    if (isFlat) {
      const segments: Projected[][] = [];
      let seg: Projected[] = [];

      // In flat mode, split polygons across big longitude jumps to avoid seam artifacts.
      poly.forEach((coord, i) => {
        const [lat, lon] = coord;
        if (typeof lat !== "number" || typeof lon !== "number") return;

        const prev = i > 0 ? poly[i - 1] : undefined;
        if (prev) {
          const [, prevLon] = prev;
          if (typeof prevLon === "number" && Math.abs(lon - prevLon) > 120) {
            if (seg.length >= 3) segments.push(seg);
            seg = [];
          }
        }

        seg.push(proj(lat, lon));
      });

      if (seg.length >= 3) segments.push(seg);

      segments.forEach((s) =>
        simpleDraw(ctx, s, colors.coastFill, colors.coast),
      );
      return;
    }

    const anyVis = pts.some((p) => p.z > 0);
    if (!anyVis) return;

    const allVis = pts.every((p) => p.z > 0);
    if (allVis) {
      simpleDraw(ctx, pts, colors.coastFill, colors.coast);
      return;
    }

    drawClippedPoly(ctx, pts, gcx, gcy, gr, colors.coastFill, colors.coast);
  });
}

type FlatGridConfig = {
  isFlat: true;
  cx: number;
  cy: number;
  mW: number;
  mH: number;
  mx: number;
  my: number;
  accentColor: string;
};

type GlobeGridConfig = {
  isFlat: false;
  accentColor: string;
};

type GridConfig = FlatGridConfig | GlobeGridConfig;

function drawFlatGrid(ctx: CanvasRenderingContext2D, cfg: FlatGridConfig) {
  const { cx, cy, mW, mH, mx, my } = cfg;

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
}

function strokeProjectedLine(
  ctx: CanvasRenderingContext2D,
  start: number,
  end: number,
  step: number,
  project: (v: number) => Projected,
) {
  ctx.beginPath();
  let on = false;

  for (let v = start; v <= end; v += step) {
    const p = project(v);
    if (p.z > 0) {
      if (!on) {
        ctx.moveTo(p.x, p.y);
        on = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    } else {
      on = false;
    }
  }

  ctx.stroke();
}

function drawGlobeGrid(ctx: CanvasRenderingContext2D, projFn: ProjFn) {
  for (let lat = -80; lat <= 80; lat += 20) {
    strokeProjectedLine(ctx, -180, 180, 3, (lon) => projFn(lat, lon));
  }

  for (let lon = -180; lon < 180; lon += 30) {
    strokeProjectedLine(ctx, -90, 90, 3, (lat) => projFn(lat, lon));
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  projFn: ProjFn,
  cfg: GridConfig,
) {
  ctx.strokeStyle = cfg.accentColor;
  ctx.globalAlpha = 0.11;
  ctx.lineWidth = 0.4;

  if (cfg.isFlat) drawFlatGrid(ctx, cfg);
  else drawGlobeGrid(ctx, projFn);

  ctx.globalAlpha = 1;
}

function drawPoints(
  ctx: CanvasRenderingContext2D,
  data: DataPoint[],
  layers: Record<string, boolean>,
  aircraftFilter: AircraftFilter,
  selected: DataPoint | null,
  isolatedId: string | null,
  isolateMode: null | "solo" | "focus",
  projFn: ProjFn,
  t: number,
  colors: ThemeColors,
  searchMatchIds: Set<string> | null | undefined,
) {
  const colorMap: Record<string, string> = {
    ships: colors.ships,
    aircraft: colors.aircraft,
    events: colors.events,
    quakes: colors.quakes,
  };

  const isolatedItem = isolatedId
    ? data.find((d) => d.id === isolatedId)
    : null;
  const isolatedType = isolatedItem?.type ?? null;

  const pts: Array<Projected & { item: DataPoint }> = [];
  data.forEach((item) => {
    // Search filter: when active, only show matching items
    if (searchMatchIds && !searchMatchIds.has(item.id)) return;

    if (isolateMode === "solo") {
      // Solo: only this one point, everything else gone
      if (item.id !== isolatedId) return;
    } else if (isolateMode === "focus") {
      // Focus: only this layer type, other layers hidden
      if (isolatedType && item.type !== isolatedType) return;
      // Within the focused layer, still apply normal filters
    }

    if (item.type === "aircraft") {
      if (!matchesAircraftFilter(item, aircraftFilter)) return;
    } else {
      if (layers[item.type] === false) return;
    }

    // Use interpolated position for moving items (aircraft, ships)
    let lat = item.lat;
    let lon = item.lon;
    if (item.type === "aircraft" || item.type === "ships") {
      const interp = getInterpolatedPosition(item.id);
      if (interp) {
        lat = interp.lat;
        lon = interp.lon;
      }
    }

    const p = projFn(lat, lon);
    if (p.z > 0) pts.push({ ...p, item });
  });
  pts.sort((a, b) => a.z - b.z);

  // ── Draw trail for selected item (behind points) ─────────────────
  if (selected) {
    const trail = getTrail(selected.id);
    if (trail.length >= 1) {
      const trailCoords = trail.map((tp) => ({ lat: tp.lat, lon: tp.lon }));
      const interp = getInterpolatedPosition(selected.id);
      if (interp) {
        trailCoords.push(interp);
      }

      if (trailCoords.length >= 2) {
        const projectedTrail = trailCoords
          .map((tp) => projFn(tp.lat, tp.lon))
          .filter((p) => p.z > 0);

        if (projectedTrail.length >= 2) {
          ctx.save();
          ctx.lineJoin = "round";
          ctx.lineCap = "round";

          // Glow pass
          ctx.lineWidth = 6;
          for (let i = 1; i < projectedTrail.length; i++) {
            const prev = projectedTrail[i - 1]!;
            const curr = projectedTrail[i]!;
            const age = i / projectedTrail.length;
            ctx.globalAlpha = 0.05 + age * 0.15;
            ctx.strokeStyle = colors.accent;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
          }

          // Main line
          ctx.lineWidth = 2.5;
          for (let i = 1; i < projectedTrail.length; i++) {
            const prev = projectedTrail[i - 1]!;
            const curr = projectedTrail[i]!;
            const age = i / projectedTrail.length;
            ctx.globalAlpha = 0.3 + age * 0.7;
            ctx.strokeStyle = colors.accent;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
          }

          // Dots at each recorded waypoint
          for (let i = 0; i < projectedTrail.length - 1; i++) {
            const p = projectedTrail[i]!;
            const age = i / projectedTrail.length;
            ctx.globalAlpha = 0.4 + age * 0.6;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }
      }
    }
  }
  ctx.globalAlpha = 1;

  pts.forEach(({ x, y, z, item }) => {
    const color = colorMap[item.type] ?? colors.accent;
    const alpha = 0.4 + z * 0.6;
    let s =
      item.type === "quakes"
        ? 2.5 + parseFloat((item as any).data?.magnitude || "0") * 1.1
        : item.type === "events"
          ? 3.5 + ((item as any).data?.severity || 0) * 0.8
          : item.type === "aircraft"
            ? 4
            : 3;
    const isSel = selected?.id === item.id;
    if (isSel) s *= 1.8;

    if (
      item.type === "events" ||
      (item.type === "quakes" &&
        parseFloat((item as any).data?.magnitude || "0") > 3)
    ) {
      const pulse =
        1 + Math.sin(t + (parseInt(item.id.slice(1)) || 0) * 0.7) * 0.35;
      const gr = s * 4 * pulse;
      const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
      g.addColorStop(0, color + "40");
      g.addColorStop(1, color + "00");
      ctx.fillStyle = g;
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, gr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = alpha;
    if (item.type === "aircraft") {
      const status = (item as any).data?.squawkStatus;
      ctx.fillStyle =
        status === "emergency"
          ? "#ff3333"
          : status === "radio_failure"
            ? "#ff8800"
            : status === "hijack"
              ? "#cc44ff"
              : color;
    } else {
      ctx.fillStyle = color;
    }
    if (item.type === "aircraft") {
      const a = (((item as any).data?.heading || 0) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(a) * s * 1.6, y - Math.cos(a) * s * 1.6);
      ctx.lineTo(x + Math.sin(a + 2.4) * s, y - Math.cos(a + 2.4) * s);
      ctx.lineTo(x + Math.sin(a - 2.4) * s, y - Math.cos(a - 2.4) * s);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isSel) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
}

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
  zoomToId,
  searchMatchIds,
}: Readonly<GlobeVisualizationProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef({
    rotY: 0,
    rotX: 0.3,
    vy: 0,
    zoomGlobe: 1,
    zoomFlat: 1,
    panX: 0,
    panY: 0,
  });
  const camTargetRef = useRef<{
    rotY: number;
    rotX: number;
    zoom: number;
    panX: number;
    panY: number;
    active: boolean;
    lockedId: string | null;
  }>({
    rotY: 0,
    rotX: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    active: false,
    lockedId: null,
  });
  const dragRef = useRef({
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
    lastClickId: null as string | null,
  });
  const sizeRef = useRef({ w: 800, h: 600 });
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
      const targetZoom = Math.max(cam.zoomFlat, 20);
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
      camTarget.zoom = Math.max(cam.zoomGlobe, 15);
    }
    camTarget.active = true;
    camTarget.lockedId = zoomToId;
  }, [zoomToId, data, flat]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let running = true;

    // Fetch HD land data in background — render loop reads getLand() each frame
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

      // ── Camera animation (zoom-to-target / lock-on) ─────────────────
      const camTarget = camTargetRef.current;

      // If locked onto a selected item, update target to follow it
      if (camTarget.lockedId && sel && sel.id === camTarget.lockedId) {
        const interp = getInterpolatedPosition(sel.id);
        const tLat = interp ? interp.lat : sel.lat;
        const tLon = interp ? interp.lon : sel.lon;

        if (isFlat) {
          const { w: fw, h: fh } = sizeRef.current;
          const mW = fw * 0.92 * cam.zoomFlat;
          const mH = fh * 0.84 * cam.zoomFlat;
          camTarget.panX = -(tLon / 180) * (mW / 2);
          camTarget.panY = (tLat / 90) * (mH / 2);
          camTarget.active = true;
        } else {
          const phi = ((90 - tLat) * Math.PI) / 180;
          const theta = ((tLon + 180) * Math.PI) / 180;
          camTarget.rotY = Math.PI / 2 - theta;
          camTarget.rotX = -(phi - Math.PI / 2);
          camTarget.active = true;
        }
      }

      // Clear lock if selection changed
      if (camTarget.lockedId && (!sel || sel.id !== camTarget.lockedId)) {
        camTarget.lockedId = null;
        camTarget.active = false;
      }

      // Lerp camera toward target
      if (camTarget.active) {
        const lerpSpeed = 0.08;
        if (isFlat) {
          cam.panX += (camTarget.panX - cam.panX) * lerpSpeed;
          cam.panY += (camTarget.panY - cam.panY) * lerpSpeed;
          cam.zoomFlat += (camTarget.zoom - cam.zoomFlat) * lerpSpeed;
          const { w: cw, h: ch } = sizeRef.current;
          clampFlatPan(cam, cw, ch);
        } else {
          cam.rotY += (camTarget.rotY - cam.rotY) * lerpSpeed;
          cam.rotX += (camTarget.rotX - cam.rotX) * lerpSpeed;
          cam.zoomGlobe += (camTarget.zoom - cam.zoomGlobe) * lerpSpeed;
          cam.vy = 0;
        }

        // Stop animating once close enough (unless locked on)
        if (!camTarget.lockedId) {
          const dZoom = Math.abs(
            isFlat
              ? cam.zoomFlat - camTarget.zoom
              : cam.zoomGlobe - camTarget.zoom,
          );
          const dRot = isFlat
            ? Math.abs(cam.panX - camTarget.panX) +
              Math.abs(cam.panY - camTarget.panY)
            : Math.abs(cam.rotY - camTarget.rotY) +
              Math.abs(cam.rotX - camTarget.rotX);
          if (dZoom < 0.01 && dRot < 0.001) {
            camTarget.active = false;
          }
        }
      }

      if (!isFlat && !drag.active && shouldRotate && !camTarget.active)
        cam.rotY += 0.002 * rotSpeed;
      cam.rotY += cam.vy;
      cam.vy *= 0.95;

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

      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
    return () => {
      running = false;
    };
  }, []);

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
      // Only reassign if dimensions actually changed — assignment clears the buffer
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cam = camRef.current;
    const drag = dragRef.current;

    const onDown = (e: MouseEvent | TouchEvent) => {
      // Middle mouse button (1) — toggle auto-rotate
      if ("button" in e && e.button === 1) {
        e.preventDefault();
        const props = propsRef.current;
        props.onMiddleClick?.();
        return;
      }
      // Only handle left mouse button (0) or touch — ignore right-click
      if ("button" in e && e.button !== 0) return;

      // Detect pinch start
      if ("touches" in e && e.touches.length === 2) {
        const t0 = e.touches[0]!,
          t1 = e.touches[1]!;
        drag.pinching = true;
        drag.pinchDist = Math.hypot(
          t1.clientX - t0.clientX,
          t1.clientY - t0.clientY,
        );
        drag.active = false;
        return;
      }

      const p = "touches" in e ? e.touches[0] : e;
      if (!p) return;
      const rect = canvas.getBoundingClientRect();
      const mx = p.clientX - rect.left;
      const my = p.clientY - rect.top;
      const { w: W, h: H } = sizeRef.current;
      const isFlat = propsRef.current.flat;
      let interactive = false;
      if (isFlat) {
        const {
          mW,
          mH,
          mx: ox,
          my: oy,
        } = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
        interactive = mx >= ox && mx <= ox + mW && my >= oy && my <= oy + mH;
      } else {
        const r = Math.min(W, H) * 0.4 * cam.zoomGlobe;
        interactive = Math.hypot(mx - W / 2, my - H / 2) <= r;
      }
      drag.active = true;
      drag.interactive = interactive;
      drag.dist = 0;
      drag.lx = p.clientX;
      drag.ly = p.clientY;
      drag.sx = p.clientX;
      drag.sy = p.clientY;
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      // Handle pinch zoom
      if ("touches" in e && e.touches.length === 2 && drag.pinching) {
        const t0 = e.touches[0]!,
          t1 = e.touches[1]!;
        const newDist = Math.hypot(
          t1.clientX - t0.clientX,
          t1.clientY - t0.clientY,
        );
        if (drag.pinchDist > 0) {
          const factor = newDist / drag.pinchDist;
          if (propsRef.current.flat) {
            cam.zoomFlat = Math.max(
              0.85,
              Math.min(80.0, cam.zoomFlat * factor),
            );
            const { w: W, h: H } = sizeRef.current;
            clampFlatPan(cam, W, H);
          } else {
            cam.zoomGlobe = Math.max(
              0.55,
              Math.min(50.0, cam.zoomGlobe * factor),
            );
          }
        }
        drag.pinchDist = newDist;
        return;
      }

      if (!drag.active) return;
      if (!drag.interactive) return;
      canvas.style.cursor = "grabbing";
      const p = "touches" in e ? e.touches[0] : e;
      if (!p) return;
      const dx = p.clientX - drag.lx,
        dy = p.clientY - drag.ly;
      drag.dist += Math.abs(dx) + Math.abs(dy);

      // Dragging breaks lock-on
      if (drag.dist > 6) {
        camTargetRef.current.lockedId = null;
        camTargetRef.current.active = false;
      }

      if (!propsRef.current.flat) {
        const zf = cam.zoomGlobe || 1;
        cam.rotY += (dx * 0.005) / zf;
        cam.rotX += (dy * 0.005) / zf;
        cam.rotX = Math.max(-1.2, Math.min(1.2, cam.rotX));
        cam.vy = (dx * 0.001) / zf;
      } else {
        const { w: W, h: H } = sizeRef.current;
        cam.panX += dx;
        cam.panY += dy;
        clampFlatPan(cam, W, H);
      }
      drag.lx = p.clientX;
      drag.ly = p.clientY;
    };
    const onUp = () => {
      if (drag.pinching) {
        drag.pinching = false;
        drag.pinchDist = 0;
        return;
      }
      if (!drag.active) return;
      if (drag.dist < 6) {
        canvas.style.cursor = "default";

        if (!drag.interactive) {
          propsRef.current.onRawCanvasClick?.();
          drag.active = false;
          drag.interactive = false;
          return;
        }

        const rect = canvas.getBoundingClientRect();
        const mx = drag.sx - rect.left,
          my = drag.sy - rect.top;
        const { w: W, h: H } = sizeRef.current;
        const cxc = W / 2,
          cyc = H / 2;
        const {
          data: d,
          layers: ly,
          aircraftFilter: af,
          flat: isFlat,
          onSelect: sel,
        } = propsRef.current;
        let closest: DataPoint | null = null;
        let cd = 14;
        d.forEach((item) => {
          if (item.type === "aircraft") {
            if (!matchesAircraftFilter(item, af)) return;
          } else if (!ly[item.type]) return;

          // Use interpolated position for moving items
          let lat = item.lat;
          let lon = item.lon;
          if (item.type === "aircraft" || item.type === "ships") {
            const interp = getInterpolatedPosition(item.id);
            if (interp) {
              lat = interp.lat;
              lon = interp.lon;
            }
          }

          const flatMetrics = getFlatMetrics(
            W,
            H,
            camRef.current.zoomFlat,
            camRef.current.panX,
            camRef.current.panY,
          );
          const p = isFlat
            ? projFlat(
                lat,
                lon,
                flatMetrics.cx,
                flatMetrics.cy,
                flatMetrics.mW,
                flatMetrics.mH,
              )
            : projGlobe(
                lat,
                lon,
                cxc,
                cyc,
                Math.min(W, H) * 0.4 * camRef.current.zoomGlobe,
                camRef.current.rotY,
                camRef.current.rotX,
              );
          if (p.z <= 0) return;
          const dd = Math.hypot(p.x - mx, p.y - my);
          if (dd < cd) {
            cd = dd;
            closest = item;
          }
        });
        if (closest) {
          const hit: DataPoint = closest;
          const now = Date.now();
          const isDoubleClick =
            // @ts-ignore
            now - drag.lastClickTime < 400 && drag.lastClickId === hit.id;

          sel(hit);

          if (isDoubleClick) {
            const camTarget = camTargetRef.current;
            const isFlat = propsRef.current.flat;
            // @ts-ignore
            const interp = getInterpolatedPosition(hit.id);
            // @ts-ignore
            const tLat = interp ? interp.lat : hit.lat;
            // @ts-ignore
            const tLon = interp ? interp.lon : hit.lon;

            if (isFlat) {
              const { w: fw, h: fh } = sizeRef.current;
              const targetZoom = Math.max(camRef.current.zoomFlat, 20);
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
              camTarget.zoom = Math.max(camRef.current.zoomGlobe, 15);
            }
            camTarget.active = true;
            // @ts-ignore
            camTarget.lockedId = hit.id;
          }

          drag.lastClickTime = now;
          // @ts-ignore
          drag.lastClickId = hit.id;
        } else {
          drag.lastClickTime = 0;
          drag.lastClickId = null;
        }
      }
      drag.active = false;
      drag.interactive = false;
      canvas.style.cursor = "default";
    };

    const onHover = (e: MouseEvent) => {
      if (drag.active) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { w: W, h: H } = sizeRef.current;
      const isFlat = propsRef.current.flat;
      let insideGlobe = false;
      if (isFlat) {
        const {
          mW,
          mH,
          mx: ox,
          my: oy,
        } = getFlatMetrics(
          W,
          H,
          camRef.current.zoomFlat,
          camRef.current.panX,
          camRef.current.panY,
        );
        insideGlobe = mx >= ox && mx <= ox + mW && my >= oy && my <= oy + mH;
      } else {
        insideGlobe =
          Math.hypot(mx - W / 2, my - H / 2) <=
          Math.min(W, H) * 0.4 * camRef.current.zoomGlobe;
      }
      if (!insideGlobe) {
        canvas.style.cursor = "default";
        return;
      }
      const { data: d, layers: ly, aircraftFilter: af } = propsRef.current;
      let hit = false;
      d.forEach((item) => {
        if (hit) return;
        if (item.type === "aircraft") {
          if (!matchesAircraftFilter(item, af)) return;
        } else if (!ly[item.type]) return;

        let lat = item.lat;
        let lon = item.lon;
        if (item.type === "aircraft" || item.type === "ships") {
          const interp = getInterpolatedPosition(item.id);
          if (interp) {
            lat = interp.lat;
            lon = interp.lon;
          }
        }

        const flatMetrics = getFlatMetrics(
          W,
          H,
          camRef.current.zoomFlat,
          camRef.current.panX,
          camRef.current.panY,
        );
        const p = isFlat
          ? projFlat(
              lat,
              lon,
              flatMetrics.cx,
              flatMetrics.cy,
              flatMetrics.mW,
              flatMetrics.mH,
            )
          : projGlobe(
              lat,
              lon,
              W / 2,
              H / 2,
              Math.min(W, H) * 0.4 * camRef.current.zoomGlobe,
              camRef.current.rotY,
              camRef.current.rotX,
            );
        if (p.z <= 0) return;
        if (Math.hypot(p.x - mx, p.y - my) < 14) hit = true;
      });
      canvas.style.cursor = hit ? "pointer" : "grab";
    };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("mousemove", onHover);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const camState = camRef.current;
      const camTarget = camTargetRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);

      if (camTarget.lockedId) {
        // Locked on: zoom the target, let the lerp keep it centered
        if (propsRef.current.flat) {
          camTarget.zoom = Math.max(
            0.85,
            Math.min(80.0, camTarget.zoom * factor),
          );
        } else {
          camTarget.zoom = Math.max(
            0.55,
            Math.min(50.0, camTarget.zoom * factor),
          );
        }
        camTarget.active = true;
      } else if (propsRef.current.flat) {
        const { w: W, h: H } = sizeRef.current;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left - W / 2;
        const my = e.clientY - rect.top - H / 2;
        const oldZoom = camState.zoomFlat;
        camState.zoomFlat = Math.max(0.85, Math.min(80.0, oldZoom * factor));
        const actualFactor = camState.zoomFlat / oldZoom;
        camState.panX = mx - actualFactor * (mx - camState.panX);
        camState.panY = my - actualFactor * (my - camState.panY);
        clampFlatPan(camState, W, H);
      } else {
        camState.zoomGlobe = Math.max(
          0.55,
          Math.min(50.0, camState.zoomGlobe * factor),
        );
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    const onTouchMove = (e: TouchEvent) => {
      // Prevent browser pinch-zoom / scroll on the canvas
      if (e.touches.length >= 2 || drag.active) e.preventDefault();
      (onMove as (e: TouchEvent) => void)(e);
    };
    canvas.addEventListener("touchstart", onDown, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onUp);
    const onContextMenu = () => {
      drag.active = false;
      drag.interactive = false;
      canvas.style.cursor = "default";
    };
    canvas.addEventListener("contextmenu", onContextMenu);

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture keys if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const cam = camRef.current;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          propsRef.current.onMiddleClick?.();
          break;
        case "ArrowLeft":
          e.preventDefault();
          cam.rotY -= 0.05;
          break;
        case "ArrowRight":
          e.preventDefault();
          cam.rotY += 0.05;
          break;
        case "ArrowUp":
          e.preventDefault();
          cam.rotX = Math.max(-1.2, cam.rotX - 0.05);
          break;
        case "ArrowDown":
          e.preventDefault();
          cam.rotX = Math.min(1.2, cam.rotX + 0.05);
          break;
        case "Equal":
        case "NumpadAdd":
          e.preventDefault();
          if (propsRef.current.flat) {
            cam.zoomFlat = Math.min(80.0, cam.zoomFlat * 1.1);
            const { w: W, h: H } = sizeRef.current;
            clampFlatPan(cam, W, H);
          } else {
            cam.zoomGlobe = Math.min(50.0, cam.zoomGlobe * 1.1);
          }
          break;
        case "Minus":
        case "NumpadSubtract":
          e.preventDefault();
          if (propsRef.current.flat) {
            cam.zoomFlat = Math.max(0.85, cam.zoomFlat / 1.1);
            const { w: W, h: H } = sizeRef.current;
            clampFlatPan(cam, W, H);
          } else {
            cam.zoomGlobe = Math.max(0.55, cam.zoomGlobe / 1.1);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mousemove", onHover);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ cursor: "default", display: "block" }}
    />
  );
}
