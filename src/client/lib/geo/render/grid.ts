import type {
  Projected,
  ProjFn,
  RenderContext2D,
} from "@/lib/geo/render/types";
import { GeoLimit } from "@shared/geo";

export const GRID_POLICY = Object.freeze({
  parallelStepDegrees: 20,
  parallelMinDegrees: -80,
  parallelMaxDegrees: 80,
  meridianStepDegrees: 30,
  meridianMinDegrees: GeoLimit.MinLongitude,
  meridianMaxDegrees: GeoLimit.MaxLongitude,
  sampleStepDegrees: 3,
  latitudeSpan: GeoLimit.MaxLatitude,
  longitudeSpan: GeoLimit.MaxLongitude,
  lineWidth: 0.4,
  alpha: 0.11,
  fallbackColor: "#000",
});

export type FlatGridConfig = Readonly<{
  isFlat: true;
  accentColor?: string;
  gridAlpha?: number;
  cx: number;
  cy: number;
  mW: number;
  mH: number;
  mx: number;
  my: number;
}>;

export type GlobeGridConfig = Readonly<{
  isFlat: false;
  accentColor?: string;
  gridAlpha?: number;
}>;

export type GridConfig = FlatGridConfig | GlobeGridConfig;

function drawFlatGrid(ctx: RenderContext2D, cfg: FlatGridConfig): void {
  for (
    let lat = GRID_POLICY.parallelMinDegrees;
    lat <= GRID_POLICY.parallelMaxDegrees;
    lat += GRID_POLICY.parallelStepDegrees
  ) {
    const y = cfg.cy - (lat / GRID_POLICY.latitudeSpan) * (cfg.mH / 2);
    ctx.beginPath();
    ctx.moveTo(cfg.mx, y);
    ctx.lineTo(cfg.mx + cfg.mW, y);
    ctx.stroke();
  }

  for (
    let lon = GRID_POLICY.meridianMinDegrees;
    lon < GRID_POLICY.meridianMaxDegrees;
    lon += GRID_POLICY.meridianStepDegrees
  ) {
    const x = cfg.cx + (lon / GRID_POLICY.longitudeSpan) * (cfg.mW / 2);
    ctx.beginPath();
    ctx.moveTo(x, cfg.my);
    ctx.lineTo(x, cfg.my + cfg.mH);
    ctx.stroke();
  }
}

function strokeProjectedLine(
  ctx: RenderContext2D,
  start: number,
  end: number,
  project: (value: number) => Projected,
): void {
  ctx.beginPath();
  let penDown = false;
  for (let value = start; value <= end; value += GRID_POLICY.sampleStepDegrees) {
    const point = project(value);
    if (point.z <= 0) {
      penDown = false;
      continue;
    }
    if (penDown) ctx.lineTo(point.x, point.y);
    else {
      ctx.moveTo(point.x, point.y);
      penDown = true;
    }
  }
  ctx.stroke();
}

function drawGlobeGrid(ctx: RenderContext2D, projFn: ProjFn): void {
  for (
    let lat = GRID_POLICY.parallelMinDegrees;
    lat <= GRID_POLICY.parallelMaxDegrees;
    lat += GRID_POLICY.parallelStepDegrees
  ) {
    strokeProjectedLine(
      ctx,
      GRID_POLICY.meridianMinDegrees,
      GRID_POLICY.meridianMaxDegrees,
      (lon) => projFn(lat, lon),
    );
  }

  for (
    let lon = GRID_POLICY.meridianMinDegrees;
    lon < GRID_POLICY.meridianMaxDegrees;
    lon += GRID_POLICY.meridianStepDegrees
  ) {
    strokeProjectedLine(
      ctx,
      -GRID_POLICY.latitudeSpan,
      GRID_POLICY.latitudeSpan,
      (lat) => projFn(lat, lon),
    );
  }
}

export function drawGrid(
  ctx: RenderContext2D,
  projFn: ProjFn,
  cfg: GridConfig,
): void {
  ctx.strokeStyle = cfg.accentColor ?? GRID_POLICY.fallbackColor;
  ctx.globalAlpha = cfg.gridAlpha ?? GRID_POLICY.alpha;
  ctx.lineWidth = GRID_POLICY.lineWidth;

  if (cfg.isFlat) drawFlatGrid(ctx, cfg);
  else drawGlobeGrid(ctx, projFn);

  ctx.globalAlpha = 1;
}
