// ── Spaghetti model render (worker) ──────────────────────────────────
// Strokes each storm's guidance model tracks on the globe under the MODELS
// toggle. Each model gets its own distinct color (TV-style) from the shared
// classification colormap, so the dossier mini-map and the globe match.

import type { Ctx, ProjFn } from "@/features/environmental/cyclones/render/cycloneGeometry";
import { modelColor } from "@/features/environmental/cyclones/classification";

export type ModelTrackPoint = { lat: number; lon: number };
export type ModelTrack = { model: string; points: ModelTrackPoint[] };

/** Stroke one polyline through projected, front-facing points (z>0). Breaks the
 *  path where a point rotates behind the globe so lines don't wrap across it. */
function strokeTrack(ctx: Ctx, projFn: ProjFn, points: ModelTrackPoint[]): void {
  ctx.beginPath();
  let pen = false;
  for (const p of points) {
    const pp = projFn(p.lat, p.lon);
    if (pp.z > 0) {
      if (pen) ctx.lineTo(pp.x, pp.y);
      else {
        ctx.moveTo(pp.x, pp.y);
        pen = true;
      }
    } else {
      pen = false;
    }
  }
  ctx.stroke();
}

/** Draw one storm's spaghetti tracks, each model its own color. Drawn under the
 *  storm marker/cone so the official track stays legible on top. The tracks ride
 *  on the storm's own data (item.data.models) — same path as cone/wind/track. */
export function drawCycloneModels(
  ctx: Ctx,
  projFn: ProjFn,
  models: ReadonlyArray<ModelTrack>,
  depthAlpha: number,
): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 1;
  ctx.globalAlpha = depthAlpha * 0.6;
  for (const track of models) {
    if (track.points.length < 2) continue;
    ctx.strokeStyle = modelColor(track.model);
    strokeTrack(ctx, projFn, track.points);
  }
  ctx.globalAlpha = 1;
}
