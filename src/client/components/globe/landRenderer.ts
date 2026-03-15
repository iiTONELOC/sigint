import { getLand } from "@/lib/landService";
import type { Projected, ProjFn, HorizonCircle } from "./types";
import type { ThemeColors } from "@/config/theme";

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

export function drawLand(
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
