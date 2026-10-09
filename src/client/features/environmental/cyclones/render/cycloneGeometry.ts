// The globe worker and the dossier mini map share these painters so both surfaces draw identical storms.

import type { ProjFn, Pt, RenderContext2D } from "@/lib/geo/render/types";
import { AngleConversion, GeoMeasurement, TurnDeg, type GeoPoint } from "@shared/geo";
import { drawSceneGeometry, type SceneAreaProjection } from "@/workers/render/scene/areaGeometry";
import { strokeGeoPath, tracePoints } from "@/lib/geo/render/path";
import { POLYGON_POLICY, PolygonFillRule } from "@/lib/geo/render/polygon";
import { windChanceColor, windColor, windRadiiBandColor } from "../classification";
import { RASTER_SOURCE_METADATA, type RasterCircle, type RasterSource } from "../data/radar";

const WR_QUAD_CENTER = [45, 135, 225, 315];
const WR_STEPS = 64;

/** Smoothstep-interpolated radius (nm) at a compass bearing from the four
 *  per-quadrant values [NE, SE, SW, NW], so a one-sided storm tapers smoothly
 *  instead of forming flat cardinal walls. */
export function wrRadiusAt(q: readonly number[], bearing: number): number {
  const hit = WR_QUAD_CENTER.map((center, i) => ({
    i,
    d: (((bearing - center) % 360) + 360) % 360,
  })).find(({ d }) => d <= 90);
  if (!hit) return 0;
  const v0 = Math.max(0, q[hit.i] ?? 0);
  const v1 = Math.max(0, q[(hit.i + 1) % 4] ?? 0);
  const t = hit.d / 90;
  return v0 + (v1 - v0) * (t * t * (3 - 2 * t)); // smoothstep
}

/** One wind-radii band as a closed loop of screen points around the eye.
 *  `pxPerNm` converts nm → screen px. Empty if the band has no extent. */
export function windRadiiBandPoints(
  q: readonly number[],
  eyeX: number,
  eyeY: number,
  pxPerNm: number,
): Array<[number, number]> {
  if (!q.some((v) => v > 0)) return [];
  return Array.from({ length: WR_STEPS + 1 }, (_, i) => {
    const bearing = (i / WR_STEPS) * 360;
    const r = wrRadiusAt(q, bearing) * pxPerNm;
    const a = ((bearing - 90) * Math.PI) / 180;
    return [eyeX + Math.cos(a) * r, eyeY + Math.sin(a) * r] as [number, number];
  });
}

export type WindRadiiBand = Readonly<{
  threshold: number;
  quadrants: readonly number[];
  fillAlpha: number;
}>;

/** The eye on screen plus the scale that turns nautical miles into pixels. */
export type EyeScale = Pt & Readonly<{ pixelsPerNm: number }>;

const WIND_BAND_RIM_WIDTH = 1;
/** Cone and wind field read as glass: a light fill under a solid rim. */
export const GLASS_FILL_ALPHA = 0.18;
export const WIND_BAND_RIM_ALPHA = 0.9;
const CASING_EXTRA_WIDTH = 2;

/** How strong a stroke is and the map's own dark colour to case it with. */
export type CasedStroke = Readonly<{ alpha: number; casing: string }>;

// The casing is the map's own dark colour, so it only shows where cloud, radar or a fill sits behind the line.
function strokeCased(context: RenderContext2D, color: string, casing: string): void {
  const width = context.lineWidth;
  context.strokeStyle = casing;
  context.lineWidth = width + CASING_EXTRA_WIDTH;
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

/** Fill each wind band around the eye; a `rim` also outlines it over a dark casing. */
export function paintWindRadiiBands(
  context: RenderContext2D,
  eye: EyeScale,
  bands: Iterable<WindRadiiBand>,
  rim: CasedStroke | null = null,
): void {
  for (const band of bands) {
    const points = windRadiiBandPoints(band.quadrants, eye.x, eye.y, eye.pixelsPerNm);
    if (points.length === 0) continue;
    tracePoints(context, points, true);
    context.fillStyle = windRadiiBandColor(band.threshold);
    context.globalAlpha = band.fillAlpha;
    context.fill();
    if (!rim) continue;
    context.globalAlpha = rim.alpha;
    context.lineWidth = WIND_BAND_RIM_WIDTH;
    strokeCased(context, windRadiiBandColor(band.threshold), rim.casing);
  }
}

export type TrackVertex = Readonly<{ x: number; y: number; z: number; windKt: number }>;

/** Strokes each leg in the colour of the wind at the point it leaves; the caller sets width, dash, and alpha. */
export function strokeIntensityTrack(context: RenderContext2D, vertices: readonly TrackVertex[]): void {
  for (let index = 1; index < vertices.length; index++) {
    const from = vertices[index - 1];
    const to = vertices[index];
    if (!from || !to || from.z <= 0 || to.z <= 0) continue;
    context.strokeStyle = windColor(from.windKt);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
}

type ConeBand = Readonly<{ color: string; corners: readonly Pt[] }>;

function unit(x: number, y: number): Pt {
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

function legDirection(from: Pt, to: Pt): Pt {
  return unit(to.x - from.x, to.y - from.y);
}

// A band edge bisects the turn at each vertex so neighbouring bands meet without a gap.
function vertexDirections(track: readonly TrackVertex[]): Pt[] {
  const legs = track.slice(1).map((to, index) => legDirection(track[index] ?? to, to));
  return track.map((_, index) => {
    const incoming = legs[index - 1];
    const outgoing = legs[index];
    if (!incoming || !outgoing) return incoming ?? outgoing ?? { x: 1, y: 0 };
    return unit(incoming.x + outgoing.x, incoming.y + outgoing.y);
  });
}

function offset(point: Pt, direction: Pt, distance: number): Pt {
  return { x: point.x + direction.x * distance, y: point.y + direction.y * distance };
}

function edge(point: Pt, direction: Pt, reach: number): readonly [Pt, Pt] {
  const normal = { x: -direction.y, y: direction.x };
  return [offset(point, normal, reach), offset(point, normal, -reach)];
}

function coneBands(track: readonly TrackVertex[], reach: number): ConeBand[] {
  const directions = vertexDirections(track);
  const first = track[0];
  const last = track.at(-1);
  const head = directions[0];
  const tail = directions.at(-1);
  if (!first || !last || !head || !tail) return [];
  const stops = [offset(first, head, -reach), ...track, offset(last, tail, reach)];
  const stopDirections = [head, ...directions, tail];
  const colors = [first, ...track].map((vertex) => windColor(vertex.windKt));
  return colors.map((color, index) => {
    const [startLeft, startRight] = edge(stops[index] ?? first, stopDirections[index] ?? head, reach);
    const [endLeft, endRight] = edge(stops[index + 1] ?? last, stopDirections[index + 1] ?? tail, reach);
    return { color, corners: [startLeft, endLeft, endRight, startRight] };
  });
}

function traceRings(context: RenderContext2D, rings: readonly (readonly Pt[])[]): void {
  context.beginPath();
  for (const ring of rings) {
    ring.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
  }
}

/** Fills the cone outline in bands along the track, each in the colour of the wind at the point it leaves, like the trail. */
export function fillCategoryCone(
  context: RenderContext2D,
  rings: readonly (readonly Pt[])[],
  track: readonly TrackVertex[],
  look: CasedStroke,
): void {
  const { alpha, casing } = look;
  const visible = track.filter((vertex, index) =>
    vertex.z > 0 && (index === 0 || vertex.x !== track[index - 1]?.x || vertex.y !== track[index - 1]?.y));
  const points = rings.flat();
  if (visible.length === 0 || points.length === 0) return;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const reach = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  context.save();
  traceRings(context, rings);
  context.clip(PolygonFillRule.EvenOdd);
  context.globalAlpha = alpha;
  for (const band of coneBands(visible, reach)) {
    tracePoints(context, band.corners.map((corner) => [corner.x, corner.y]), true);
    context.fillStyle = band.color;
    context.fill();
  }
  context.restore();
  traceRings(context, rings);
  context.lineWidth = POLYGON_POLICY.strokeWidth;
  context.globalAlpha = alpha + POLYGON_POLICY.strokeAlphaGain;
  strokeCased(context, windColor(visible[0]?.windKt ?? 0), casing);
}

/** An X at the genesis point; the caller sets stroke colour, width, and alpha. */
export function drawGenesisMark(
  context: RenderContext2D,
  x: number,
  y: number,
  armLength: number,
): void {
  context.beginPath();
  context.moveTo(x - armLength, y - armLength);
  context.lineTo(x + armLength, y + armLength);
  context.moveTo(x - armLength, y + armLength);
  context.lineTo(x + armLength, y - armLength);
  context.stroke();
}

const RADAR_GRID_CELLS = 16;
// Each cell also covers one source pixel of its neighbours so the affine fits leave no seams.
const RADAR_SEAM_PIXELS = 1;
const FULL_TURN_RADIANS = TurnDeg.Full * AngleConversion.RadiansPerDegree;
// Each band's ring encloses every higher band, so the next band cuts a hole in it and any spot is covered once.
const PROBABILITY_BAND_ALPHA = 0.3;
const SURGE_ALPHA = 0.45;
const ARRIVAL_DASH: readonly number[] = [3, 3];
const ARRIVAL_LABEL_FONT = "600 10px 'JetBrains Mono', monospace";
const ARRIVAL_LABEL_OFFSET_PX = 4;

export type RadarRaster = Readonly<{
  image: CanvasImageSource & Readonly<{ width: number; height: number }>;
  bounds: Readonly<{ minLat: number; maxLat: number; minLon: number; maxLon: number }>;
  source: RasterSource;
}>;

type RadarCell = Readonly<{ column: number; row: number; width: number; height: number }>;

// A lat/lon raster cannot be drawn straight onto a globe; each small cell is drawn with its own affine fit.
function paintRadarCell(context: RenderContext2D, project: ProjFn, radar: RadarRaster, cell: RadarCell): void {
  const { bounds } = radar;
  const lonStep = (bounds.maxLon - bounds.minLon) / RADAR_GRID_CELLS;
  const latStep = (bounds.maxLat - bounds.minLat) / RADAR_GRID_CELLS;
  const lon = bounds.minLon + cell.column * lonStep;
  const lat = bounds.maxLat - cell.row * latStep;
  const origin = project(lat, lon);
  const east = project(lat, lon + lonStep);
  const south = project(lat - latStep, lon);
  if (origin.z <= 0 || east.z <= 0 || south.z <= 0) return;
  context.save();
  context.transform(
    (east.x - origin.x) / cell.width, (east.y - origin.y) / cell.width,
    (south.x - origin.x) / cell.height, (south.y - origin.y) / cell.height,
    origin.x, origin.y,
  );
  const sourceWidth = Math.min(cell.width + RADAR_SEAM_PIXELS, radar.image.width - cell.column * cell.width);
  const sourceHeight = Math.min(cell.height + RADAR_SEAM_PIXELS, radar.image.height - cell.row * cell.height);
  context.drawImage(
    radar.image, cell.column * cell.width, cell.row * cell.height, sourceWidth, sourceHeight,
    0, 0, sourceWidth, sourceHeight,
  );
  context.restore();
}

type RadarRegion = Readonly<{ x: number; y: number; width: number; height: number }>;

type RadarWarp = { key: string; canvas: OffscreenCanvas; region: RadarRegion };

// The warp is the costly part, so each surface keeps one per loop frame and redoes it only
// when the storm moves on screen; looping in place then costs one drawImage per frame.
const radarWarps = new WeakMap<RenderContext2D, WeakMap<object, RadarWarp>>();

function surfaceWarps(context: RenderContext2D): WeakMap<object, RadarWarp> {
  let warps = radarWarps.get(context);
  if (!warps) {
    warps = new WeakMap();
    radarWarps.set(context, warps);
  }
  return warps;
}

type RadarCircle = Readonly<{ x: number; y: number; radius: number }>;

function radarCircle(project: ProjFn, clip: RasterCircle): RadarCircle | null {
  const eye = project(clip.lat, clip.lon);
  if (eye.z <= 0) return null;
  const edge = project(clip.lat + clip.reachNm / GeoMeasurement.NauticalMilesPerDegree, clip.lon);
  return { x: eye.x, y: eye.y, radius: Math.hypot(edge.x - eye.x, edge.y - eye.y) };
}

function visibleRegion(context: RenderContext2D, circle: RadarCircle, scale: number): RadarRegion | null {
  const left = Math.max(0, Math.floor(circle.x - circle.radius));
  const top = Math.max(0, Math.floor(circle.y - circle.radius));
  const right = Math.min(context.canvas.width / scale, Math.ceil(circle.x + circle.radius));
  const bottom = Math.min(context.canvas.height / scale, Math.ceil(circle.y + circle.radius));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

type RadarWarpTarget = Readonly<{ region: RadarRegion; scale: number; reuse: OffscreenCanvas | undefined }>;

function warpRadar(project: ProjFn, radar: RadarRaster, target: RadarWarpTarget): RadarWarp | null {
  const { region, scale, reuse } = target;
  const pixelWidth = Math.max(1, Math.ceil(region.width * scale));
  const pixelHeight = Math.max(1, Math.ceil(region.height * scale));
  const canvas = reuse?.width === pixelWidth && reuse.height === pixelHeight
    ? reuse
    : new OffscreenCanvas(pixelWidth, pixelHeight);
  const scratch = canvas.getContext("2d");
  if (!scratch) return null;
  scratch.setTransform(1, 0, 0, 1, 0, 0);
  scratch.clearRect(0, 0, pixelWidth, pixelHeight);
  scratch.setTransform(scale, 0, 0, scale, -region.x * scale, -region.y * scale);
  const width = radar.image.width / RADAR_GRID_CELLS;
  const height = radar.image.height / RADAR_GRID_CELLS;
  for (let row = 0; row < RADAR_GRID_CELLS; row++) {
    for (let column = 0; column < RADAR_GRID_CELLS; column++) {
      paintRadarCell(scratch, project, radar, { column, row, width, height });
    }
  }
  return { key: "", canvas, region };
}

/** A radar or satellite frame warped onto the projection, kept inside the storm's circle, blended in one pass. */
export function paintRaster(context: RenderContext2D, project: ProjFn, radar: RadarRaster, clip: RasterCircle): void {
  const circle = radarCircle(project, clip);
  if (!circle) return;
  const scale = context.getTransform().a;
  const region = visibleRegion(context, circle, scale);
  if (!region) return;
  const key = [circle.x, circle.y, circle.radius, scale, region.width, region.height].map((value) => Math.round(value)).join();
  const warps = surfaceWarps(context);
  let warp = warps.get(radar.image);
  if (warp?.key !== key) {
    const fresh = warpRadar(project, radar, { region, scale, reuse: warp?.canvas });
    if (!fresh) return;
    warp = { ...fresh, key };
    warps.set(radar.image, warp);
  }
  context.save();
  context.beginPath();
  context.arc(circle.x, circle.y, circle.radius, 0, FULL_TURN_RADIANS);
  context.clip();
  const look = RASTER_SOURCE_METADATA[radar.source];
  context.globalAlpha = look.alpha;
  context.globalCompositeOperation = look.blend;
  context.drawImage(warp.canvas, warp.region.x, warp.region.y, warp.region.width, warp.region.height);
  context.restore();
}

function ringPolygons(rings: readonly (readonly GeoPoint[])[]): GeoPoint[][][] {
  return rings.map((ring) => [[...ring]]);
}

/** Probability bands in their scale colours, each drawn as the ring between it and the next higher band. */
export function paintProbabilityBands(
  context: RenderContext2D,
  projection: SceneAreaProjection,
  bands: readonly Readonly<{ rank: number; rings: readonly (readonly GeoPoint[])[] }>[],
): void {
  const ranked = [...bands].sort((left, right) => left.rank - right.rank);
  ranked.forEach((band, index) => {
    const rings = [...band.rings, ...(ranked[index + 1]?.rings ?? [])].map((ring) => [...ring]);
    drawSceneGeometry(context, [rings], projection, windChanceColor(band.rank), PROBABILITY_BAND_ALPHA);
  });
}

/** Coastal peak-surge areas. */
export function paintSurgeAreas(
  context: RenderContext2D,
  projection: SceneAreaProjection,
  areas: readonly Readonly<{ rings: readonly (readonly GeoPoint[])[] }>[],
  color: string,
): void {
  for (const area of areas) drawSceneGeometry(context, ringPolygons(area.rings), projection, color, SURGE_ALPHA);
}

function labelArrivalLine(context: RenderContext2D, project: ProjFn, line: readonly GeoPoint[], label: string): void {
  const middle = line[Math.floor(line.length / 2)];
  if (!middle) return;
  const point = project(middle[1], middle[0]);
  if (point.z <= 0) return;
  context.strokeText(label, point.x + ARRIVAL_LABEL_OFFSET_PX, point.y - ARRIVAL_LABEL_OFFSET_PX);
  context.fillText(label, point.x + ARRIVAL_LABEL_OFFSET_PX, point.y - ARRIVAL_LABEL_OFFSET_PX);
}

/** Dashed arrival-time lines, each labelled with its time, over a dark casing; the caller sets stroke colour and width. */
export function strokeArrivalLines(
  context: RenderContext2D,
  project: ProjFn,
  lines: readonly Readonly<{ label: string; line: readonly GeoPoint[] }>[],
  casing: string,
): void {
  const color = context.strokeStyle;
  const width = context.lineWidth;
  context.setLineDash([...ARRIVAL_DASH]);
  context.strokeStyle = casing;
  context.lineWidth = width + CASING_EXTRA_WIDTH;
  for (const { line } of lines) strokeGeoPath(context, project, [...line]);
  context.strokeStyle = color;
  context.lineWidth = width;
  for (const { line } of lines) strokeGeoPath(context, project, [...line]);
  context.setLineDash([]);
  context.font = ARRIVAL_LABEL_FONT;
  context.strokeStyle = casing;
  context.lineWidth = CASING_EXTRA_WIDTH;
  context.fillStyle = color;
  for (const { line, label } of lines) labelArrivalLine(context, project, line, label);
}
