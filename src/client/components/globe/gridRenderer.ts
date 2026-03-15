import type { Projected, ProjFn, FlatGridConfig, GridConfig } from "./types";

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

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  projFn: ProjFn,
  cfg: GridConfig,
) {
  ctx.strokeStyle = cfg.accentColor ?? "#000";
  ctx.globalAlpha = 0.11;
  ctx.lineWidth = 0.4;

  if (cfg.isFlat) drawFlatGrid(ctx, cfg);
  else drawGlobeGrid(ctx, projFn);

  ctx.globalAlpha = 1;
}
