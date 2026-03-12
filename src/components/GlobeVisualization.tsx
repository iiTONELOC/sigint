import React, { useEffect, useRef } from "react";
import { LAND } from "@/lib/land";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors } from "@/config/theme";
import { type DataPoint } from "@/lib/mockData";

interface GlobeVisualizationProps {
  readonly flat?: boolean;
  readonly data: DataPoint[];
  readonly layers: Record<string, boolean>;
  readonly selected: DataPoint | null;
  readonly onSelect: (item: DataPoint | null) => void;
}

interface Projected {
  x: number;
  y: number;
  z: number;
}

type ProjFn = (lat: number, lon: number) => Projected;

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
  LAND.forEach((poly) => {
    const pts: Projected[] = poly.reduce<Projected[]>((acc, coord) => {
      const [lat, lon] = coord;
      if (typeof lat !== "number" || typeof lon !== "number") return acc;
      acc.push(proj(lat, lon));
      return acc;
    }, []);

    if (pts.length < 3) return;

    if (isFlat) {
      simpleDraw(ctx, pts, colors.coastFill, colors.coast);
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
  selected: DataPoint | null,
  projFn: ProjFn,
  t: number,
  colors: ThemeColors,
) {
  const colorMap: Record<string, string> = {
    ships: colors.ships,
    aircraft: colors.aircraft,
    events: colors.events,
    quakes: colors.quakes,
  };

  const pts: Array<Projected & { item: DataPoint }> = [];
  data.forEach((item) => {
    if (!layers[item.type]) return;
    const p = projFn(item.lat, item.lon);
    if (p.z > 0) pts.push({ ...p, item });
  });
  pts.sort((a, b) => a.z - b.z);

  pts.forEach(({ x, y, z, item }) => {
    const color = colorMap[item.type] ?? colors.accent;
    const alpha = 0.4 + z * 0.6;
    let s =
      item.type === "quakes"
        ? 2.5 + parseFloat(item.magnitude || "0") * 1.1
        : item.type === "events"
          ? 3.5 + (item.severity || 0) * 0.8
          : item.type === "aircraft"
            ? 4
            : 3;
    const isSel = selected?.id === item.id;
    if (isSel) s *= 1.8;

    if (
      item.type === "events" ||
      (item.type === "quakes" && parseFloat(item.magnitude || "0") > 3)
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
    ctx.fillStyle = color;
    if (item.type === "aircraft") {
      const a = ((item.heading || 0) * Math.PI) / 180;
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
  data,
  layers,
  selected,
  onSelect,
}: Readonly<GlobeVisualizationProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef({ rotY: 0, rotX: 0.3, vy: 0 });
  const dragRef = useRef({
    active: false,
    lx: 0,
    ly: 0,
    dist: 0,
    sx: 0,
    sy: 0,
  });
  const sizeRef = useRef({ w: 800, h: 600 });
  const propsRef = useRef({ data, layers, flat, selected, onSelect });
  propsRef.current = { data, layers, flat, selected, onSelect };

  const { theme } = useTheme();
  const colorsRef = useRef(theme.colors);
  colorsRef.current = theme.colors;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let running = true;

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
        flat: isFlat,
        selected: sel,
      } = propsRef.current;
      const C = colorsRef.current;
      const t = Date.now() * 0.003;

      if (!isFlat && !drag.active) cam.rotY += 0.002;
      cam.rotY += cam.vy;
      cam.vy *= 0.95;

      ctx.clearRect(0, 0, W, H);

      if (!isFlat) {
        const r = Math.min(W, H) * 0.4;
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

        drawPoints(ctx, d, ly, sel, proj, t, C);
      } else {
        const mW = W * 0.92,
          mH = H * 0.84;
        const mx = (W - mW) / 2,
          my = (H - mH) / 2;
        const proj: ProjFn = (lat, lon) => projFlat(lat, lon, cx, cy, mW, mH);

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
        drawPoints(ctx, d, ly, sel, proj, t, C);

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
            cx + (lon / 180) * (mW / 2),
            my + mH + 13,
          );
        }
        ctx.textAlign = "right";
        for (let lat = -60; lat <= 60; lat += 30) {
          ctx.fillText(
            `${Math.abs(lat)}\u00B0${lat >= 0 ? "N" : "S"}`,
            mx - 5,
            cy - (lat / 90) * (mH / 2) + 3,
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
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cam = camRef.current;
    const drag = dragRef.current;

    const onDown = (e: MouseEvent | TouchEvent) => {
      const p = "touches" in e ? e.touches[0] : e;
      if (!p) return;
      drag.active = true;
      drag.dist = 0;
      drag.lx = p.clientX;
      drag.ly = p.clientY;
      drag.sx = p.clientX;
      drag.sy = p.clientY;
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!drag.active) return;
      const p = "touches" in e ? e.touches[0] : e;
      if (!p) return;
      const dx = p.clientX - drag.lx,
        dy = p.clientY - drag.ly;
      drag.dist += Math.abs(dx) + Math.abs(dy);
      if (!propsRef.current.flat) {
        cam.rotY += dx * 0.005;
        cam.rotX += dy * 0.005;
        cam.rotX = Math.max(-1.2, Math.min(1.2, cam.rotX));
        cam.vy = dx * 0.001;
      }
      drag.lx = p.clientX;
      drag.ly = p.clientY;
    };
    const onUp = () => {
      if (drag.dist < 6) {
        const rect = canvas.getBoundingClientRect();
        const mx = drag.sx - rect.left,
          my = drag.sy - rect.top;
        const { w: W, h: H } = sizeRef.current;
        const cxc = W / 2,
          cyc = H / 2;
        const {
          data: d,
          layers: ly,
          flat: isFlat,
          onSelect: sel,
        } = propsRef.current;
        let closest: DataPoint | null = null,
          cd = 20;
        d.forEach((item) => {
          if (!ly[item.type]) return;
          const p = isFlat
            ? projFlat(item.lat, item.lon, cxc, cyc, W * 0.92, H * 0.84)
            : projGlobe(
                item.lat,
                item.lon,
                cxc,
                cyc,
                Math.min(W, H) * 0.4,
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
        sel(closest);
      }
      drag.active = false;
    };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: true });
    canvas.addEventListener("touchmove", onMove as EventListener, {
      passive: true,
    });
    canvas.addEventListener("touchend", onUp);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("touchmove", onMove as EventListener);
      canvas.removeEventListener("touchend", onUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ cursor: "grab", display: "block" }}
    />
  );
}
