/// <reference lib="webworker" />
// Owns the transferred canvas and all Canvas2D drawing.
import { drawCyclone, drawCycloneForecastPoint } from "./render/cyclones";
import { CAMERA_POLICY, RENDER_POLICY } from "./render/policy";
import {
  applyCameraKey,
  applyCameraWheel,
  beginCameraPinch,
  beginCameraPointer,
  cameraContainsPoint,
  cameraSnapshot,
  cancelCameraPointer,
  createWorkerCameraState,
  createWorkerCameraTarget,
  createWorkerPointerState,
  endCameraPinch,
  endCameraPointer,
  focusCamera,
  lockCamera,
  moveCameraPinch,
  moveCameraPointer,
  stepCamera,
  type CameraClick,
  type CameraPosition,
} from "./render/camera";
import {
  RENDER_PROTOCOL_VERSION,
  acceptRenderCommand,
  type RenderAircraftFilter,
  type RenderCamera,
  type RenderInputPayload,
  type RenderInteractionPayload,
  type RenderPresentationPayload,
  type RenderViewportPayload,
  type RenderProtocolState,
  type RenderPoint,
  type RenderWorkerCommand,
  type RenderWorkerColors,
  type RenderWorkerEvent,
  type SelectedRenderItem,
} from "./render/protocol";

import {
  EARTHQUAKE_UNIT_VECTOR_COMPONENTS,
  PACKED_POSITION_COMPONENTS,
  PACKED_UNIT_VECTOR_COMPONENTS,
  acceptRenderDataCommand,
  parseRenderDataCommand,
  type PackedEarthquakeRenderData,
  type PackedFireRenderData,
  type RenderDataProtocolState,
} from "./render/dataChannel";

import { orderPointsByLayer } from "./render/layerOrder";
import { isWorkerOwnedPointType } from "./render/workerOwnedTypes";
import type { DataType } from "@/features/base/dataPoints";
import { createRenderSceneStore } from "./render/sceneStore";
import {
  aircraftSceneIncludes,
  drawAircraftScene,
  type AircraftSceneFilter,
} from "./render/scene/aircraftLayer";
import {
  createProjectedSceneLayer,
  type ProjectedSceneLayer,
} from "./render/scene/projectedLayer";
import {
  drawShipScene,
  shipSceneIncludes,
  type ShipSceneFilter,
} from "./render/scene/shipLayer";
import { drawSelectionRing } from "./render/primitives/selectionRing";
import { RENDER_SOURCE_IDS } from "./data/sourceIds";
import { drawWarnings, type WarningFeature } from "./render/warnings";
import {
  acceptSceneDataCommand,
  parseSceneDataCommand,
  type SceneDataProtocolState,
} from "./render/sceneProtocol";
import { zoomScale } from "./render/workerMath";
import { weatherSeverityRank } from "@/features/environmental/weather/severity";
import { pointInPolygon } from "@/lib/geo/pointInPolygon";
import {
  screenToLatLonFlat,
  screenToLatLonGlobe,
} from "@/lib/geo/spatialIndex";
import type { Ctx, Projected, ProjFn } from "@/features/environmental/cyclones/render/cycloneGeometry";
import {
  advanceGeographicMotion,
  createGeographicMotion,
  createGlobeRotationMatrix,
  geographicToUnitVector,
  projectGeographicPoint as projGlobe,
  projectUnitVector,
  projectUnitVectorInto,
  type GeographicMotion,
  type GlobeRotationMatrix,
  type UnitVector,
} from "@/lib/geo/unitSphere";
import type { GeoRing } from "@shared/geo";
import { parseLandGeoJson } from "@shared/land";
import { getFlatMetrics, projFlat } from "@/lib/geo/render/flatMap";
import { drawGrid } from "@/lib/geo/render/grid";
import { drawFlatLandRing, drawProjectedLandRing } from "@/lib/geo/render/land";
import { drawClippedPoly, simpleDraw } from "@/lib/geo/render/polygon";
import type { HorizonCircle, LandColors } from "@/lib/geo/render/types";

// ── Interpolation ───────────────────────────────────────────────────

type TrailEntry = Readonly<{
  timestamp: number;
  speedMetersPerSecond: number;
  motion: GeographicMotion;
}>;

let trailMap = new Map<string, TrailEntry>();

function interpolationSeconds(
  id: string,
  entry: TrailEntry,
): number | null {
  if (entry.speedMetersPerSecond <= 0) return null;
  const elapsedMilliseconds = Date.now() - entry.timestamp;
  const limit = id.startsWith("S")
    ? RENDER_POLICY.shipInterpolationLimitMs
    : RENDER_POLICY.aircraftInterpolationLimitMs;
  if (
    elapsedMilliseconds < RENDER_POLICY.minimumInterpolationAgeMs ||
    elapsedMilliseconds > limit
  ) {
    return null;
  }
  return elapsedMilliseconds / 1_000;
}

function getInterp(id: string): { lat: number; lon: number } | null {
  const entry = trailMap.get(id);
  if (!entry) return null;
  const elapsedSeconds = interpolationSeconds(id, entry);
  if (elapsedSeconds === null) return null;
  const position = advanceGeographicMotion(entry.motion, elapsedSeconds);
  return { lat: position.latitude, lon: position.longitude };
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
  const g = c.getContext("2d");
  if (!g) return c;
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

const WEATHER_MARKER_BY_RANK = [
  { size: 1.5, alpha: 0.6 },
  { size: 2, alpha: 0.6 },
  { size: 3, alpha: 0.75 },
  { size: 4.5, alpha: 0.9 },
  { size: 6, alpha: 1 },
] as const;

function weatherMarker(sev: string): { size: number; alpha: number } {
  const top = WEATHER_MARKER_BY_RANK.length - 1;
  const rank = Math.min(Math.max(weatherSeverityRank(sev), 0), top);
  return WEATHER_MARKER_BY_RANK[rank] ?? WEATHER_MARKER_BY_RANK[0];
}

// ── Aircraft filter ─────────────────────────────────────────────────

type AircraftData = Extract<
  RenderPoint,
  { type: "aircraft" }
>["data"];
type AircraftFilter = RenderAircraftFilter;

const TRACKED_SQUAWKS: ReadonlySet<string> = new Set([
  "7700",
  "7600",
  "7500",
]);
const OTHER_SQUAWK = "other";

function matchesAltitudeBand(
  d: AircraftData,
  f: AircraftFilter,
): boolean {
  const onGround = d.onGround === true;
  return onGround ? f.showGround : f.showAirborne;
}

function matchesRole(d: AircraftData, f: AircraftFilter): boolean {
  switch (f.milFilter || "all") {
    case "military":
      return d.military === true;
    case "civilian":
      return d.military !== true;
    case "recon":
      return d.recon === true;
    default:
      return true;
  }
}

function matchesSquawk(d: AircraftData, f: AircraftFilter): boolean {
  if (f.squawks.length === 0) return true;
  const squawk = d.squawk || "";
  const bucket = TRACKED_SQUAWKS.has(squawk) ? squawk : OTHER_SQUAWK;
  return f.squawks.includes(bucket);
}

function matchesCountry(d: AircraftData, f: AircraftFilter): boolean {
  return (
    f.countries.length === 0 ||
    f.countries.includes(d.originCountry || "")
  );
}

function matchesAF(d: AircraftData, f: AircraftFilter): boolean {
  return (
    f.enabled &&
    matchesAltitudeBand(d, f) &&
    matchesRole(d, f) &&
    matchesSquawk(d, f) &&
    matchesCountry(d, f)
  );
}

// ── Land data ───────────────────────────────────────────────────────

type LandRing = Readonly<{
  coordinates: GeoRing;
  unitVectors: readonly UnitVector[];
  projected: Projected[];
}>;

let landRings: LandRing[] = [];

function parseLandGeoJSON(value: unknown): LandRing[] {
  const rings: LandRing[] = [];
  for (const polygon of parseLandGeoJson(value)) {
    for (const coordinates of polygon) {
      const unitVectors = coordinates.map(([longitude, latitude]) =>
        geographicToUnitVector(latitude, longitude),
      );
      rings.push({
        coordinates,
        unitVectors,
        projected: unitVectors.map(() => ({ x: 0, y: 0, z: 0 })),
      });
    }
  }
  return rings;
}

function fetchLandData(): void {
  void fetch(RENDER_POLICY.landGeometryUrl)
    .then((response) => {
      if (!response.ok) throw new Error("Land geometry request failed");
      return response.json();
    })
    .then((value: unknown) => {
      landRings = parseLandGeoJSON(value);
      scheduleRender();
    })
    .catch(() => undefined);
}

type WorkerLandOptions = Readonly<{
  matrix: GlobeRotationMatrix;
  colors: LandColors;
  isFlat: boolean;
  horizon: HorizonCircle;
  alpha: number;
}>;

function drawLand(
  ctx: Ctx,
  projFn: ProjFn,
  options: WorkerLandOptions,
): void {
  const { horizon } = options;
  for (const ring of landRings) {
    if (options.isFlat) {
      drawFlatLandRing(
        ctx,
        ring.coordinates,
        projFn,
        options.colors,
        options.alpha,
      );
      continue;
    }
    const points = ring.projected;
    for (const [index, unit] of ring.unitVectors.entries()) {
      const point = points[index];
      if (!point) continue;
      projectUnitVectorInto(
        unit,
        options.matrix,
        horizon.gcx,
        horizon.gcy,
        horizon.gr,
        point,
      );
    }
    drawProjectedLandRing(ctx, points, options.colors, options.alpha, horizon);
  }
}


// ── Trail drawing ───────────────────────────────────────────────────

type WorkerTrailPoint = SelectedRenderItem["trail"][number];
type ProjTrail = { x: number; y: number; z: number; point: WorkerTrailPoint };
type TrailHitTarget = Readonly<{
  x: number;
  y: number;
  point: WorkerTrailPoint;
}>;

function strokeTrailPass(ctx: Ctx, projected: ProjTrail[], width: number, base: number, span: number, color: string): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  for (let i = 1; i < projected.length; i++) {
    const prev = projected[i - 1];
    const curr = projected[i];
    if (!prev || !curr) continue;
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
  selectedItem: SelectedRenderItem | null,
  colors: { accent: string },
): TrailHitTarget[] {
  const trail = selectedItem?.trail;
  if (!selectedItem || !trail || trail.length < 1) return [];
  const coords: WorkerTrailPoint[] = trail.map((p) => ({
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

  const hitTargets: TrailHitTarget[] = [];
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
  route: ReadonlyArray<readonly [number, number]> | null | undefined,
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
    const start = route[i];
    const end = route[i + 1];
    if (!start || !end) continue;
    const [ay, ax] = start;
    const [by, bx] = end;
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
  const a0 = route[segI];
  const a1 = route[segI + 1];
  if (!a0 || !a1) return;
  const split: [number, number] = [a0[0] + segT * (a1[0] - a0[0]), a0[1] + segT * (a1[1] - a0[1])];

  const flown: Array<readonly [number, number]> = [...route.slice(0, segI + 1), split];
  const ahead: Array<readonly [number, number]> = [split, ...route.slice(segI + 1)];

  const strokePts = (pts: ReadonlyArray<readonly [number, number]>) => {
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



let canvas: OffscreenCanvas | null = null;
let ctx: Ctx | null = null;
let _data: RenderPoint[] | null = null;
let _colors: RenderWorkerColors | null = null;
let _dataBySource: Record<string, RenderPoint[] | null> | null = null;
let _pendingBuckets: Record<string, RenderPoint[] | null> | null = null;
let _presentation: RenderPresentationPayload | null = null;
let _viewport: RenderViewportPayload | null = null;
const _camera = createWorkerCameraState();
const _cameraTarget = createWorkerCameraTarget();
const _pointer = createWorkerPointerState();
let _lastFrameAt = performance.now();
let _hasAnimatedPoints = false;
let _hitGrid = new Map<string, ProjPoint[]>();
let _trailHitTargets: TrailHitTarget[] = [];
let _activeTrailPoint: TrailHitTarget["point"] | null = null;
let _lastClickTime = 0;
let _lastClickId: string | null = null;
let _lastClickPosition: CameraPosition | null = null;
let _lastCursor: RenderInteractionPayload & { kind: "cursor" } = {
  kind: "cursor",
  cursor: "default",
};
let _lastSelectedSide: "left" | "right" = "right";
let _lastCameraSummary: RenderCamera | null = null;
let _lastCameraSummaryAt = 0;
let _frameScheduled = false;

type PackedProjectionState = {
  ids: readonly string[];
  positions: Float64Array;
  unitVectors: Float32Array;
  projected: Float32Array;
  hitHeads: Int32Array;
  hitNext: Int32Array;
  hitColumns: number;
  hitRows: number;
};

type EarthquakeRenderState = PackedEarthquakeRenderData & {
  projected: Float32Array;
  hitHeads: Int32Array;
  hitNext: Int32Array;
  hitColumns: number;
  hitRows: number;
};

type FireRenderState = PackedFireRenderData & PackedProjectionState;

const PACKED_CULL_MARGIN_PX = 24;
const EARTHQUAKE_PULSE_THRESHOLD = 3;
let _earthquakes: EarthquakeRenderState | null = null;
let _earthquakeSearchIds: ReadonlySet<string> | null = null;
let _fires: FireRenderState | null = null;
let _fireSearchIds: ReadonlySet<string> | null = null;
let _hasAnimatedEarthquakes = false;
let _hasAnimatedFires = false;
let _hasSelectedProjection = false;
let _selectedProjectionX = 0;
let _selectedProjectionDepth = -1;

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
const REVEAL_CHUNK = RENDER_POLICY.revealChunkSize;
let _revealCount = 0;

// ── Message handler ─────────────────────────────────────────────────

const protocolState: RenderProtocolState = {
  sessionId: null,
  sequence: 0,
};

let dataPort: MessagePort | null = null;

const aircraftSceneStore = createRenderSceneStore("aircraft");
const aircraftProjection = createProjectedSceneLayer();
const shipSceneStore = createRenderSceneStore("ships");
const shipProjection = createProjectedSceneLayer();
const TYPED_SCENE_STORES = {
  aircraft: aircraftSceneStore,
  ships: shipSceneStore,
} as const;
const typedScenes = new Map(
  RENDER_SOURCE_IDS.map((source) => [
    source,
    source === "aircraft" || source === "ships"
      ? TYPED_SCENE_STORES[source]
      : createRenderSceneStore(source),
  ] as const),
);

function bindDataPort(port: MessagePort, sessionId: string): void {
  dataPort?.close();
  dataPort = port;
  const state: RenderDataProtocolState = {
    sessionId,
    sequence: 0,
  };
  const sceneState: SceneDataProtocolState = {
    sessionId,
    sequence: 0,
  };
  port.onmessage = (event: MessageEvent<unknown>) => {
    const command = parseRenderDataCommand(event.data);
    if (command && acceptRenderDataCommand(state, command)) {
      if (command.type === "bind") {
        const ready: RenderWorkerEvent = {
          type: "dataChannelReady",
          protocolVersion: RENDER_PROTOCOL_VERSION,
          sessionId,
          sequence: protocolState.sequence,
        };
        globalThis.postMessage(ready);
        return;
      }
      applyRenderDataCommand(command);
      scheduleRender();
      return;
    }

    const sceneCommand = parseSceneDataCommand(event.data);
    if (
      !sceneCommand ||
      !acceptSceneDataCommand(sceneState, sceneCommand) ||
      sceneCommand.type === "bind"
    ) {
      return;
    }
    const sceneStore = typedScenes.get(sceneCommand.source);
    if (!sceneStore) return;
    sceneStore.apply(sceneCommand);
    scheduleRender();
  };
  port.start();
}

function postInteraction(payload: RenderInteractionPayload): void {
  if (!protocolState.sessionId) return;
  const event: RenderWorkerEvent = {
    type: "interaction",
    protocolVersion: RENDER_PROTOCOL_VERSION,
    sessionId: protocolState.sessionId,
    sequence: protocolState.sequence,
    payload,
  };
  globalThis.postMessage(event);
}

function postCursor(cursor: RenderInteractionPayload & { kind: "cursor" }): void {
  if (_lastCursor.cursor === cursor.cursor) return;
  _lastCursor = cursor;
  postInteraction(cursor);
}

function postCameraSummary(now: number): void {
  if (
    now - _lastCameraSummaryAt <
    CAMERA_POLICY.cameraSummaryIntervalMs
  ) {
    return;
  }
  const snapshot = cameraSnapshot(_camera);
  const previous = _lastCameraSummary;
  if (
    previous?.rotY === snapshot.rotY &&
    previous.rotX === snapshot.rotX &&
    previous.zoomGlobe === snapshot.zoomGlobe &&
    previous.zoomFlat === snapshot.zoomFlat &&
    previous.panX === snapshot.panX &&
    previous.panY === snapshot.panY
  ) {
    return;
  }
  if (!protocolState.sessionId) return;
  _lastCameraSummary = snapshot;
  _lastCameraSummaryAt = now;
  const event: RenderWorkerEvent = {
    type: "camera",
    protocolVersion: RENDER_PROTOCOL_VERSION,
    sessionId: protocolState.sessionId,
    sequence: protocolState.sequence,
    payload: snapshot,
  };
  globalThis.postMessage(event);
}


function scheduleRender(): void {
  const hasState = _presentation !== null && _viewport !== null;
  if (_frameScheduled || !hasState) return;
  _frameScheduled = true;
  requestAnimationFrame(renderFrame);
}

function handleTrails(msg: Extract<RenderWorkerCommand, { type: "trails" }>): void {
  const { ids, values, timestamps } = msg;
  const nextTrails = new Map<string, TrailEntry>();
  for (const [index, id] of ids.entries()) {
    const offset = index * 4;
    const latitude = values[offset];
    const longitude = values[offset + 1];
    const heading = values[offset + 2];
    const speedMetersPerSecond = values[offset + 3];
    const timestamp = timestamps[index];
    if (
      latitude === undefined ||
      longitude === undefined ||
      heading === undefined ||
      speedMetersPerSecond === undefined ||
      timestamp === undefined
    ) {
      continue;
    }
    nextTrails.set(id, {
      timestamp,
      speedMetersPerSecond,
      motion: createGeographicMotion(
        latitude,
        longitude,
        heading,
        speedMetersPerSecond,
      ),
    });
  }
  trailMap = nextTrails;
}
function pointHasTimeAnimation(item: RenderPoint): boolean {
  if (item.type === "cyclones") return true;
  if (item.type === "events") return (item.data.severity ?? 1) >= 3;
  if (item.type === "weather") {
    return weatherSeverityRank(item.data.severity || "Unknown") >= 3;
  }
  return false;
}


function rebuildGenericData(): void {
  const nextData: RenderPoint[] = [];
  if (_dataBySource) {
    for (const bucket of Object.values(_dataBySource)) {
      if (!bucket) continue;
      for (const item of bucket) nextData.push(item);
    }
  }
  _data = nextData;
  _hasAnimatedPoints = nextData.some(pointHasTimeAnimation);
  if (_revealCount > nextData.length) _revealCount = nextData.length;
  if (_revealCount === 0 && nextData.length > 0) {
    _revealCount = Math.min(REVEAL_CHUNK, nextData.length);
  }
}

function handleEarthquakeRebase(
  packed: PackedEarthquakeRenderData,
): void {
  const count = packed.ids.length;
  _earthquakes = {
    ...packed,
    projected: new Float32Array(
      count * EARTHQUAKE_UNIT_VECTOR_COMPONENTS,
    ),
    hitHeads: new Int32Array(0),
    hitNext: new Int32Array(count),
    hitColumns: 0,
    hitRows: 0,
  };
  _hasAnimatedEarthquakes = packed.magnitudes.some(
    (magnitude) => magnitude > EARTHQUAKE_PULSE_THRESHOLD,
  );
  rebuildGenericData();
}

function handleFireRebase(packed: PackedFireRenderData): void {
  const count = packed.ids.length;
  _fires = {
    ...packed,
    projected: new Float32Array(count * PACKED_UNIT_VECTOR_COMPONENTS),
    hitHeads: new Int32Array(0),
    hitNext: new Int32Array(count),
    hitColumns: 0,
    hitRows: 0,
  };
  _hasAnimatedFires = packed.frp.some((frp) => frp > 15);
  rebuildGenericData();
}

type RenderDataCommand = NonNullable<
  ReturnType<typeof parseRenderDataCommand>
>;

/** Packed source updates from the DataWorker, past the bind handshake. */
function applyRenderDataCommand(command: RenderDataCommand): void {
  switch (command.type) {
    case "earthquakeSearch":
      _earthquakeSearchIds = command.matchingIds
        ? new Set(command.matchingIds)
        : null;
      return;
    case "fireSearch":
      _fireSearchIds = command.matchingIds
        ? new Set(command.matchingIds)
        : null;
      return;
    case "earthquakeRebase":
      handleEarthquakeRebase(command);
      return;
    case "fireRebase":
      handleFireRebase(command);
      return;
    default:
      return;
  }
}

function handleData(
  payload: Extract<RenderWorkerCommand, { type: "data" }>["payload"],
): boolean {
  _colors = payload.colors;
  _dataBySource ??= {};
  _pendingBuckets ??= {};
  const source = payload.source;
  if (payload.reset) _pendingBuckets[source] = [];
  const pending = _pendingBuckets[source] ?? (_pendingBuckets[source] = []);
  for (const item of payload.data) {
    // These arrive from the DataWorker as typed scenes or packed buffers. An
    // older bundle may still send them; drop them rather than draw twice.
    if (isWorkerOwnedPointType(item.type)) continue;
    pending.push(item);
  }
  if (!payload.done) return false;

  _dataBySource[source] = pending;
  _pendingBuckets[source] = null;
  rebuildGenericData();
  return true;
}
function selectedCameraPosition(): CameraPosition | null {
  const selected = _presentation?.selectedItem;
  if (!selected) return null;
  const interpolated = getInterp(selected.id);
  return {
    id: selected.id,
    latitude: interpolated?.lat ?? selected.lat,
    longitude: interpolated?.lon ?? selected.lon,
  };
}

type InputSurface = Readonly<{
  viewport: Readonly<{ width: number; height: number }>;
  flat: boolean;
}>;

type PointerInput = Extract<RenderInputPayload, { kind: "pointer" }>;
type PinchInput = Extract<RenderInputPayload, { kind: "pinch" }>;

function handlePointerInput(
  payload: PointerInput,
  surface: InputSurface,
): void {
  const { viewport, flat } = surface;
  switch (payload.phase) {
    case "hover":
      handlePointerHover(payload.x, payload.y);
      return;
    case "start":
      beginCameraPointer(_camera, _pointer, viewport, flat, payload.x, payload.y);
      postCursor({
        kind: "cursor",
        cursor: _pointer.interactive ? "grabbing" : "default",
      });
      break;
    case "move":
      moveCameraPointer(
        _camera,
        _cameraTarget,
        _pointer,
        viewport,
        flat,
        payload.x,
        payload.y,
      );
      break;
    case "end": {
      const click = endCameraPointer(_pointer);
      if (click) handlePointerClick(click);
      postCursor({ kind: "cursor", cursor: "default" });
      break;
    }
    default:
      cancelCameraPointer(_pointer);
      postCursor({ kind: "cursor", cursor: "default" });
  }
  scheduleRender();
}

function handlePinchInput(payload: PinchInput, surface: InputSurface): void {
  if (payload.phase === "start") {
    beginCameraPinch(_pointer, payload.distance);
  } else if (payload.phase === "move") {
    moveCameraPinch(
      _camera,
      _cameraTarget,
      _pointer,
      surface.viewport,
      surface.flat,
      payload.centerX,
      payload.centerY,
      payload.distance,
    );
  } else {
    endCameraPinch(_pointer);
  }
  scheduleRender();
}

function handleCameraInput(payload: RenderInputPayload): void {
  if (!_viewport || !_presentation) return;
  const surface: InputSurface = {
    viewport: { width: _viewport.width, height: _viewport.height },
    flat: _presentation.flat,
  };

  switch (payload.kind) {
    case "pointer":
      handlePointerInput(payload, surface);
      return;
    case "pinch":
      handlePinchInput(payload, surface);
      return;
    case "wheel":
      applyCameraWheel(
        _camera,
        _cameraTarget,
        surface.viewport,
        surface.flat,
        payload.x,
        payload.y,
        payload.deltaY,
      );
      break;
    default:
      applyCameraKey(_camera, surface.viewport, surface.flat, payload.code);
  }
  scheduleRender();
}


globalThis.onmessage = (e: MessageEvent<RenderWorkerCommand>) => {
  const msg = e.data;
  if (!acceptRenderCommand(protocolState, msg)) return;
  dispatchRenderCommand(msg);
};

function handleInit(msg: Extract<RenderWorkerCommand, { type: "init" }>): void {
  canvas = msg.canvas;
  ctx = canvas.getContext("2d");
  if (msg.dataPort) bindDataPort(msg.dataPort, msg.sessionId);
  const ready: RenderWorkerEvent = {
    type: "ready",
    protocolVersion: RENDER_PROTOCOL_VERSION,
    sessionId: msg.sessionId,
    sequence: msg.sequence,
  };
  globalThis.postMessage(ready);
  if (landRings.length === 0) fetchLandData();
}

function handleFocus(
  msg: Extract<RenderWorkerCommand, { type: "focus" }>,
): void {
  if (!_viewport || !_presentation) return;
  focusCamera(
    _camera,
    _cameraTarget,
    {
      id: msg.payload.id,
      latitude: msg.payload.latitude,
      longitude: msg.payload.longitude,
    },
    { width: _viewport.width, height: _viewport.height },
    _presentation.flat,
    msg.payload.kind,
  );
  scheduleRender();
}

function handleDispose(): void {
  dataPort?.close();
  dataPort = null;
  canvas = null;
  ctx = null;
  _presentation = null;
  _viewport = null;
  _frameScheduled = false;
}

function dispatchRenderCommand(msg: RenderWorkerCommand): void {
  switch (msg.type) {
    case "init":
      handleInit(msg);
      return;
    case "trails":
      handleTrails(msg);
      break;
    case "warnings":
      _warnings = [...msg.payload.features];
      _warnColor = msg.payload.warningColor;
      _watchColor = msg.payload.watchColor;
      break;
    case "weatherAlerts":
      _wxAlerts = [...msg.payload.features];
      _wxWarnColor = msg.payload.warningColor;
      _wxWatchColor = msg.payload.watchColor;
      break;
    case "viewport":
      _viewport = msg.payload;
      break;
    case "presentation":
      _presentation = msg.payload;
      break;
    case "focus":
      handleFocus(msg);
      return;
    case "input":
      handleCameraInput(msg.payload);
      return;
    case "dispose":
      handleDispose();
      return;
    case "data":
      if (!handleData(msg.payload)) return;
      break;
    default:
      return;
  }
  scheduleRender();
}

// ── Render everything ───────────────────────────────────────────────


// ── Per-type point drawing (extracted from the render loop) ─────────

type DotEnv = { ctx: Ctx; t: number; zoomLevel: number };

type PulseGlow = { idSliceFrom: number; rate: number; baseAmp: number; ampGain: number; radBase: number; radGain: number; alphaHex: string; glowMul: number };

/** Shared pulsing-dot renderer for quakes / events / fires / weather. `shape`
 *  draws the marker (circle vs diamond). Returns nothing; mutates the canvas. */
type PulsingDot = Readonly<{
  x: number;
  y: number;
  s: number;
  color: string;
  fillAlpha: number;
  isSel: boolean;
  glow: PulseGlowState | null;
  shape: (s: number) => void;
}>;

type PulseGlowState = Readonly<{
  intensity: number;
  pulseIndex: number;
  id: string;
  cfg: PulseGlow;
}>;

const EVENT_PULSE_GLOW: PulseGlow = {
  idSliceFrom: 2,
  rate: 0.5,
  baseAmp: 0.1,
  ampGain: 0.2,
  radBase: 1.8,
  radGain: 1.2,
  alphaHex: "30",
  glowMul: 0.4,
};

const WEATHER_PULSE_GLOW: PulseGlow = {
  ...EVENT_PULSE_GLOW,
  radGain: 1.5,
};

function drawPulsingDot(env: DotEnv, dot: PulsingDot): void {
  const { x, y, s, color, fillAlpha, isSel, glow, shape } = dot;
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

type PointProjector = (item: RenderPoint) => Projected;

const unitVectorByPoint = new WeakMap<RenderPoint, UnitVector>();

function unitVectorForPoint(item: RenderPoint): UnitVector {
  const cached = unitVectorByPoint.get(item);
  if (cached) return cached;
  const unit = geographicToUnitVector(item.lat, item.lon);
  unitVectorByPoint.set(item, unit);
  return unit;
}

type FilterCfg = {
  searchSet: Set<string> | null;
  isoMode: RenderPresentationPayload["isolateMode"];
  isoId: string | null;
  isolatedType: string | null;
  layers: Readonly<Record<string, boolean | undefined>>;
  af: AircraftFilter;
  earthquakeMinMagnitude: number;
  fireMinConfidence: number;
  showForecast: boolean;
};

/** Does one item survive the search / isolation / layer filters? */
function pointPassesFilters(item: RenderPoint, c: FilterCfg): boolean {
  if (c.searchSet && !c.searchSet.has(item.id)) return false;
  if (c.isoMode === "solo" && item.id !== c.isoId) return false;
  if (c.isoMode === "focus" && c.isolatedType && item.type !== c.isolatedType) return false;
  if (item.type === "aircraft") return matchesAF(item.data, c.af);
  if (item.type === "cyclones-forecast") return c.layers.cyclones !== false && c.showForecast !== false;
  return c.layers[item.type] !== false;
}

/** Projects visible front-facing items in stable layer order. */
function projectAndFilter(data: ReadonlyArray<RenderPoint>, projectPoint: PointProjector, c: FilterCfg): ProjPoint[] {
  const pts: ProjPoint[] = [];
  for (const item of data) {
    if (!pointPassesFilters(item, c)) continue;
    const pt = projectPoint(item);
    if (pt.z <= 0) continue;
    pts.push({ x: pt.x, y: pt.y, z: pt.z, item });
  }
  return orderPointsByLayer(pts);
}
function hitGridKey(x: number, y: number): string {
  const cellX = Math.floor(x / CAMERA_POLICY.hitCellSizePx);
  const cellY = Math.floor(y / CAMERA_POLICY.hitCellSizePx);
  return `${cellX}:${cellY}`;
}

function rebuildHitGrid(points: readonly ProjPoint[]): void {
  const next = new Map<string, ProjPoint[]>();
  for (const point of points) {
    const key = hitGridKey(point.x, point.y);
    const cell = next.get(key);
    if (!cell) {
      next.set(key, [point]);
    } else if (
      cell.length < CAMERA_POLICY.maximumHitCandidates
    ) {
      cell.push(point);
    }
  }
  _hitGrid = next;
}

function hitCandidates(x: number, y: number): ProjPoint[] {
  const centerX = Math.floor(x / CAMERA_POLICY.hitCellSizePx);
  const centerY = Math.floor(y / CAMERA_POLICY.hitCellSizePx);
  const candidates: ProjPoint[] = [];
  for (let row = centerY - 1; row <= centerY + 1; row++) {
    for (let column = centerX - 1; column <= centerX + 1; column++) {
      const cell = _hitGrid.get(`${column}:${row}`);
      if (!cell) continue;
      for (const point of cell) {
        if (
          candidates.length >=
          CAMERA_POLICY.maximumHitCandidates
        ) {
          return candidates;
        }
        candidates.push(point);
      }
    }
  }
  return candidates;
}

type PointHit = CameraPosition &
  Readonly<{ distance: number; pointType: RenderPoint["type"] }>;

type PackedProjectionFrame = Readonly<{
  width: number;
  height: number;
  flatMetrics: ReturnType<typeof getFlatMetrics> | null;
  globeMatrix: GlobeRotationMatrix;
  centerX: number;
  centerY: number;
  globeRadius: number;
  filters: FilterCfg;
  selectedId: string | null;
}>;

function preparePackedHitGrid(
  state: PackedProjectionState,
  width: number,
  height: number,
): void {
  const columns = Math.max(
    1,
    Math.ceil(width / CAMERA_POLICY.hitCellSizePx),
  );
  const rows = Math.max(
    1,
    Math.ceil(height / CAMERA_POLICY.hitCellSizePx),
  );
  const cellCount = columns * rows;
  if (state.hitHeads.length !== cellCount) {
    state.hitHeads = new Int32Array(cellCount);
  }
  state.hitHeads.fill(-1);
  state.hitNext.fill(-1);
  state.hitColumns = columns;
  state.hitRows = rows;
}

function packedLayerVisible(
  filters: FilterCfg,
  pointType: "quakes" | "fires",
): boolean {
  if (filters.layers[pointType] === false) return false;
  return !(
    filters.isoMode === "focus" &&
    filters.isolatedType &&
    filters.isolatedType !== pointType
  );
}

function packedIdPasses(
  id: string,
  filters: FilterCfg,
  searchIds: ReadonlySet<string> | null,
): boolean {
  if (searchIds && !searchIds.has(id)) return false;
  return filters.isoMode !== "solo" || id === filters.isoId;
}

function projectPackedSource(
  state: PackedProjectionState,
  frame: PackedProjectionFrame,
  pointType: "quakes" | "fires",
  searchIds: ReadonlySet<string> | null,
  passesSourceFilter: (index: number) => boolean,
): void {
  preparePackedHitGrid(state, frame.width, frame.height);
  const visible = packedLayerVisible(frame.filters, pointType);
  for (let index = 0; index < state.ids.length; index++) {
    const projectedOffset = index * PACKED_UNIT_VECTOR_COMPONENTS;
    state.projected[projectedOffset + 2] = -1;
    if (!visible || !passesSourceFilter(index)) continue;
    const id = state.ids[index];
    if (id === undefined || !packedIdPasses(id, frame.filters, searchIds)) {
      continue;
    }

    const projection = projectPackedIndex(state, frame, index);
    if (!projection) continue;
    const { x: projectedX, y: projectedY, depth } = projection;
    if (isOffscreen(projectedX, projectedY, frame)) continue;

    state.projected[projectedOffset] = projectedX;
    state.projected[projectedOffset + 1] = projectedY;
    state.projected[projectedOffset + 2] = depth;
    if (id === frame.selectedId) {
      _hasSelectedProjection = true;
      _selectedProjectionX = projectedX;
      _selectedProjectionDepth = depth;
    }
    insertPackedHit(state, index, projectedX, projectedY);
  }
}

type PackedProjection = Readonly<{ x: number; y: number; depth: number }>;

/** Flat is a straight lat/lon map; globe rotates the retained unit vector. */
function projectPackedIndex(
  state: PackedProjectionState,
  frame: PackedProjectionFrame,
  index: number,
): PackedProjection | null {
  const flat = frame.flatMetrics;
  if (flat) {
    const offset = index * PACKED_POSITION_COMPONENTS;
    const longitude = state.positions[offset];
    const latitude = state.positions[offset + 1];
    if (longitude === undefined || latitude === undefined) return null;
    return {
      x: flat.cx + (longitude / 180) * (flat.mW / 2),
      y: flat.cy - (latitude / 90) * (flat.mH / 2),
      depth: 1,
    };
  }

  const offset = index * PACKED_UNIT_VECTOR_COMPONENTS;
  const unitX = state.unitVectors[offset];
  const unitY = state.unitVectors[offset + 1];
  const unitZ = state.unitVectors[offset + 2];
  if (unitX === undefined || unitY === undefined || unitZ === undefined) {
    return null;
  }
  const m = frame.globeMatrix;
  const depth = m.m20 * unitX + m.m21 * unitY + m.m22 * unitZ;
  if (depth <= 0) return null;
  const rotatedX = m.m00 * unitX + m.m01 * unitY + m.m02 * unitZ;
  const rotatedY = m.m10 * unitX + m.m11 * unitY + m.m12 * unitZ;
  return {
    x: frame.centerX + rotatedX * frame.globeRadius,
    y: frame.centerY - rotatedY * frame.globeRadius,
    depth,
  };
}

function isOffscreen(
  x: number,
  y: number,
  frame: PackedProjectionFrame,
): boolean {
  return (
    x < -PACKED_CULL_MARGIN_PX ||
    y < -PACKED_CULL_MARGIN_PX ||
    x >= frame.width + PACKED_CULL_MARGIN_PX ||
    y >= frame.height + PACKED_CULL_MARGIN_PX
  );
}

function insertPackedHit(
  state: PackedProjectionState,
  index: number,
  x: number,
  y: number,
): void {
  const column = Math.floor(x / CAMERA_POLICY.hitCellSizePx);
  const row = Math.floor(y / CAMERA_POLICY.hitCellSizePx);
  if (
    column < 0 ||
    row < 0 ||
    column >= state.hitColumns ||
    row >= state.hitRows
  ) {
    return;
  }
  const cell = row * state.hitColumns + column;
  state.hitNext[index] = state.hitHeads[cell] ?? -1;
  state.hitHeads[cell] = index;
}

function projectEarthquakes(
  state: EarthquakeRenderState,
  frame: PackedProjectionFrame,
): void {
  projectPackedSource(
    state,
    frame,
    "quakes",
    _earthquakeSearchIds,
    (index) =>
      (state.magnitudes[index] ?? 0) >=
      frame.filters.earthquakeMinMagnitude,
  );
}

function projectFires(
  state: FireRenderState,
  frame: PackedProjectionFrame,
): void {
  projectPackedSource(
    state,
    frame,
    "fires",
    _fireSearchIds,
    (index) =>
      (state.confidences[index] ?? 0) >=
      frame.filters.fireMinConfidence,
  );
}

function nearestGenericPoint(
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  let closest: PointHit | null = null;
  let distance = radius;
  for (const point of hitCandidates(x, y)) {
    const candidateDistance = Math.hypot(
      point.x - x,
      point.y - y,
    );
    if (candidateDistance >= distance) continue;
    const position = positionForItem(point.item);
    closest = {
      ...position,
      distance: candidateDistance,
      pointType: point.item.type,
    };
    distance = candidateDistance;
  }
  return closest;
}

function nearestPackedPoint(
  state: PackedProjectionState | null,
  pointType: "quakes" | "fires",
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  if (!state || state.hitHeads.length === 0) return null;
  const centerColumn = Math.floor(
    x / CAMERA_POLICY.hitCellSizePx,
  );
  const centerRow = Math.floor(
    y / CAMERA_POLICY.hitCellSizePx,
  );
  const search: PackedHitSearch = {
    closest: null,
    distance: radius,
    inspected: 0,
  };
  for (let row = centerRow - 1; row <= centerRow + 1; row++) {
    if (row < 0 || row >= state.hitRows) continue;
    for (let column = centerColumn - 1; column <= centerColumn + 1; column++) {
      if (column < 0 || column >= state.hitColumns) continue;
      const exhausted = scanPackedCell(
        state,
        row * state.hitColumns + column,
        pointType,
        { x, y },
        search,
      );
      if (exhausted) return search.closest;
    }
  }
  return search.closest;
}

type PackedHitSearch = {
  closest: PointHit | null;
  distance: number;
  inspected: number;
};

/** Walks one cell's chain. True once the candidate budget is spent. */
function scanPackedCell(
  state: PackedProjectionState,
  cell: number,
  pointType: "quakes" | "fires",
  at: Readonly<{ x: number; y: number }>,
  search: PackedHitSearch,
): boolean {
  let index = state.hitHeads[cell] ?? -1;
  while (index >= 0) {
    const candidate = packedHitCandidate(state, index, pointType, at.x, at.y);
    if (candidate && candidate.distance < search.distance) {
      search.closest = candidate;
      search.distance = candidate.distance;
    }
    search.inspected++;
    if (search.inspected >= CAMERA_POLICY.maximumHitCandidates) return true;
    index = state.hitNext[index] ?? -1;
  }
  return false;
}

/** Null when any packed lane is short, which means the slot is not live. */
function packedHitCandidate(
  state: PackedProjectionState,
  index: number,
  pointType: "quakes" | "fires",
  x: number,
  y: number,
): PointHit | null {
  const projectedOffset = index * PACKED_UNIT_VECTOR_COMPONENTS;
  const projectedX = state.projected[projectedOffset];
  const projectedY = state.projected[projectedOffset + 1];
  const id = state.ids[index];
  const positionOffset = index * PACKED_POSITION_COMPONENTS;
  const longitude = state.positions[positionOffset];
  const latitude = state.positions[positionOffset + 1];
  if (
    projectedX === undefined ||
    projectedY === undefined ||
    id === undefined ||
    longitude === undefined ||
    latitude === undefined
  ) {
    return null;
  }
  return {
    id,
    latitude,
    longitude,
    distance: Math.hypot(projectedX - x, projectedY - y),
    pointType,
  };
}

function nearestScenePoint(
  layer: ProjectedSceneLayer,
  pointType: DataType,
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  const hit = layer.nearest(
    x,
    y,
    radius,
    CAMERA_POLICY.maximumHitCandidates,
  );
  if (!hit) return null;
  return {
    id: hit.id,
    latitude: hit.latitude,
    longitude: hit.longitude,
    distance: hit.distance,
    pointType,
  };
}

function nearestAircraftPoint(
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  return nearestScenePoint(aircraftProjection, "aircraft", x, y, radius);
}

function nearestShipPoint(
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  return nearestScenePoint(shipProjection, "ships", x, y, radius);
}

function nearestPoint(
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  let closest = nearestGenericPoint(x, y, radius);
  const specialized = [
    nearestAircraftPoint(x, y, radius),
    nearestShipPoint(x, y, radius),
    nearestPackedPoint(_earthquakes, "quakes", x, y, radius),
    nearestPackedPoint(_fires, "fires", x, y, radius),
  ];
  for (const candidate of specialized) {
    if (candidate && (!closest || candidate.distance < closest.distance)) {
      closest = candidate;
    }
  }
  return closest;
}

function nearestTrailTarget(
  x: number,
  y: number,
): TrailHitTarget | null {
  let closest: TrailHitTarget | null = null;
  let distance = CAMERA_POLICY.trailHitRadiusPx;
  for (const target of _trailHitTargets) {
    const candidateDistance = Math.hypot(
      target.x - x,
      target.y - y,
    );
    if (candidateDistance < distance) {
      closest = target;
      distance = candidateDistance;
    }
  }
  return closest;
}

function currentProjection(): ProjFn | null {
  if (!_viewport || !_presentation) return null;
  const camera = cameraSnapshot(_camera);
  const { width, height } = _viewport;
  if (_presentation.flat) {
    const metrics = getFlatMetrics(
      _viewport.width,
      _viewport.height,
      camera.zoomFlat,
      camera.panX,
      camera.panY,
    );
    return (latitude, longitude) =>
      projFlat(
        latitude,
        longitude,
        metrics.cx,
        metrics.cy,
        metrics.mW,
        metrics.mH,
      );
  }
  const radius =
    Math.min(_viewport.width, _viewport.height) *
    CAMERA_POLICY.globeRadiusRatio *
    camera.zoomGlobe;
  return (latitude, longitude) =>
    projGlobe(
      latitude,
      longitude,
      width / 2,
      height / 2,
      radius,
      camera.rotY,
      camera.rotX,
    );
}

function segmentDistance(
  x: number,
  y: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared =
    deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) {
    return Math.hypot(x - startX, y - startY);
  }
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((x - startX) * deltaX + (y - startY) * deltaY) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    x - (startX + ratio * deltaX),
    y - (startY + ratio * deltaY),
  );
}

function selectedRouteContains(x: number, y: number): boolean {
  const route = _presentation?.selectedItem?.route;
  const project = currentProjection();
  if (!route || route.length < 2 || !project) return false;
  let previous: Projected | null = null;
  for (const [latitude, longitude] of route) {
    const point = project(latitude, longitude);
    if (point.z <= 0) {
      previous = null;
      continue;
    }
    if (
      Math.hypot(point.x - x, point.y - y) <
      CAMERA_POLICY.routeHitRadiusPx
    ) {
      return true;
    }
    if (
      previous &&
      segmentDistance(
        x,
        y,
        previous.x,
        previous.y,
        point.x,
        point.y,
      ) < CAMERA_POLICY.routeHitRadiusPx
    ) {
      return true;
    }
    previous = point;
  }
  return false;
}

function screenCoordinate(
  x: number,
  y: number,
): { lat: number; lon: number } | null {
  if (!_viewport || !_presentation) return null;
  const camera = cameraSnapshot(_camera);
  if (_presentation.flat) {
    const metrics = getFlatMetrics(
      _viewport.width,
      _viewport.height,
      camera.zoomFlat,
      camera.panX,
      camera.panY,
    );
    return screenToLatLonFlat(
      x,
      y,
      metrics.cx,
      metrics.cy,
      metrics.mW,
      metrics.mH,
    );
  }
  const radius =
    Math.min(_viewport.width, _viewport.height) *
    CAMERA_POLICY.globeRadiusRatio *
    camera.zoomGlobe;
  return screenToLatLonGlobe(
    x,
    y,
    _viewport.width / 2,
    _viewport.height / 2,
    radius,
    camera.rotY,
    camera.rotX,
  );
}

function warningIdAt(x: number, y: number): string | null {
  const coordinate = screenCoordinate(x, y);
  if (!coordinate || !_warnings) return null;
  for (const warning of _warnings) {
    if (
      warning.id &&
      pointInPolygon(
        coordinate.lat,
        coordinate.lon,
        warning.geometry,
      )
    ) {
      return warning.id;
    }
  }
  return null;
}

function clearTrailTooltip(): void {
  if (!_activeTrailPoint) return;
  _activeTrailPoint = null;
  postInteraction({
    kind: "trailTooltip",
    point: null,
    x: 0,
    y: 0,
    visible: false,
  });
}

function positionForItem(item: RenderPoint): CameraPosition {
  const interpolated =
    item.type === "aircraft" || item.type === "ships"
      ? getInterp(item.id)
      : null;
  return {
    id: item.id,
    latitude: interpolated?.lat ?? item.lat,
    longitude: interpolated?.lon ?? item.lon,
  };
}

function resetClickMemory(): void {
  _lastClickTime = 0;
  _lastClickId = null;
  _lastClickPosition = null;
}

function handlePointerClick(click: CameraClick): void {
  if (!click.interactive) {
    postInteraction({ kind: "rawCanvasClick" });
    resetClickMemory();
    return;
  }

  const trailTarget = nearestTrailTarget(click.x, click.y);
  const point = nearestPoint(
    click.x,
    click.y,
    CAMERA_POLICY.pointHitRadiusPx,
  );
  const now = Date.now();
  const isDoubleClick =
    now - _lastClickTime < CAMERA_POLICY.doubleClickIntervalMs &&
    _lastClickId !== null;

  if (isDoubleClick) {
    clearTrailTooltip();
    const target = _lastClickPosition;
    if (target && _viewport && _presentation) {
      focusCamera(
        _camera,
        _cameraTarget,
        target,
        {
          width: _viewport.width,
          height: _viewport.height,
        },
        _presentation.flat,
        "double",
      );
    }
    resetClickMemory();
    return;
  }

  if (point && !trailTarget) {
    clearTrailTooltip();
    postInteraction({
      kind: "selection",
      id: point.id,
      pointType: point.pointType,
    });
    if (_presentation) {
      lockCamera(
        _camera,
        _cameraTarget,
        point.id,
        _presentation.flat,
      );
    }
    _lastClickTime = now;
    _lastClickId = point.id;
    _lastClickPosition = {
      id: point.id,
      latitude: point.latitude,
      longitude: point.longitude,
    };
    return;
  }

  if (trailTarget) {
    _activeTrailPoint = trailTarget.point;
    postInteraction({
      kind: "trailTooltip",
      point: trailTarget.point,
      x: trailTarget.x,
      y: trailTarget.y,
      visible: true,
    });
    resetClickMemory();
    return;
  }

  clearTrailTooltip();
  const warningId = warningIdAt(click.x, click.y);
  if (warningId) {
    postInteraction({
      kind: "selection",
      id: warningId,
      pointType: "cyclones-warning",
    });
  } else if (!selectedRouteContains(click.x, click.y)) {
    postInteraction({ kind: "selection", id: null, pointType: null });
  }
  resetClickMemory();
}

function handlePointerHover(x: number, y: number): void {
  if (!_viewport || !_presentation || _pointer.active) return;
  const viewport = {
    width: _viewport.width,
    height: _viewport.height,
  };
  if (
    !cameraContainsPoint(
      _camera,
      viewport,
      _presentation.flat,
      x,
      y,
    )
  ) {
    postCursor({ kind: "cursor", cursor: "default" });
    return;
  }
  const hasTrail = nearestTrailTarget(x, y) !== null;
  const hasPoint =
    nearestPoint(x, y, CAMERA_POLICY.hoverHitRadiusPx) !== null;
  const hasWarning = warningIdAt(x, y) !== null;
  postCursor({
    kind: "cursor",
    cursor:
      hasTrail || hasPoint || hasWarning ? "pointer" : "grab",
  });
}

function updateSelectedSide(): void {
  const selectedId = _presentation?.selectedId;
  if (
    !selectedId ||
    !_viewport ||
    !_hasSelectedProjection ||
    _selectedProjectionDepth <= 0
  ) {
    return;
  }
  const ratio = _selectedProjectionX / _viewport.width;
  let next = _lastSelectedSide;
  if (
    next === "right" &&
    ratio > CAMERA_POLICY.selectedSideRightRatio
  ) {
    next = "left";
  } else if (
    next === "left" &&
    ratio < CAMERA_POLICY.selectedSideLeftRatio
  ) {
    next = "right";
  }
  if (next === _lastSelectedSide) return;
  _lastSelectedSide = next;
  postInteraction({ kind: "selectedSide", side: next });
}

function updateTrailTooltip(): void {
  if (!_activeTrailPoint) return;
  const target = _trailHitTargets.find(
    (candidate) =>
      candidate.point.ts === _activeTrailPoint?.ts &&
      candidate.point.lat === _activeTrailPoint?.lat &&
      candidate.point.lon === _activeTrailPoint?.lon,
  );
  postInteraction({
    kind: "trailTooltip",
    point: _activeTrailPoint,
    x: target?.x ?? 0,
    y: target?.y ?? 0,
    visible: target !== undefined,
  });
}


type PointDrawCtx = {
  ctx: Ctx;
  projFn: ProjFn;
  colorMap: Record<string, string>;
  accent: string;
  selId: string | null;
  t: number;
  zoomLevel: number;
  showForecast: boolean;
  showCone: boolean;
  showWindField: boolean;
  showModels: boolean;
  hiddenModels: ReadonlySet<string>;
  reducedMotion: boolean;
};

function drawEarthquakeLayer(
  pc: PointDrawCtx,
  state: EarthquakeRenderState,
): void {
  const { ctx, colorMap, accent, selId, t, zoomLevel } = pc;
  const baseColor = colorMap.quakes || accent;
  const scale = zoomScale(zoomLevel);
  const pulseIntensity = clamp01((zoomLevel - 1.3) / 2);
  for (let index = 0; index < state.ids.length; index++) {
    const projectedOffset =
      index * EARTHQUAKE_UNIT_VECTOR_COMPONENTS;
    const x = state.projected[projectedOffset];
    const y = state.projected[projectedOffset + 1];
    const depth = state.projected[projectedOffset + 2];
    const id = state.ids[index];
    const magnitude = state.magnitudes[index];
    const timestamp = state.timestamps[index];
    if (
      x === undefined ||
      y === undefined ||
      depth === undefined ||
      depth <= 0 ||
      id === undefined ||
      magnitude === undefined ||
      timestamp === undefined
    ) {
      continue;
    }

    const age = quakeAgeFactor(timestamp);
    const color = quakeColor(age, baseColor);
    const selected = id === selId;
    const size =
      quakeSize(magnitude) * scale * (selected ? 2 : 1);
    const fillAlpha = (0.4 + depth * 0.6) * age * 0.8;
    if (
      magnitude > EARTHQUAKE_PULSE_THRESHOLD &&
      pulseIntensity > 0.01
    ) {
      const pulseIndex = Math.min(
        1,
        (magnitude - EARTHQUAKE_PULSE_THRESHOLD) / 4,
      );
      const phase =
        (Number.parseInt(id.slice(1), 36) || 0) * 0.7;
      const pulse =
        1 +
        Math.sin(t + phase) *
          (0.1 + pulseIndex * 0.2);
      const glowRadius =
        size * (1.8 + pulseIndex * 1.5) * pulse;
      drawGlow(
        ctx,
        color,
        "40",
        x,
        y,
        glowRadius,
        fillAlpha * pulseIntensity * 0.5,
      );
    }
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      drawSelectionRing(ctx, x, y, size, color, t);
    }
  }
  ctx.globalAlpha = 1;
}

function drawFireLayer(
  pc: PointDrawCtx,
  state: FireRenderState,
): void {
  const { ctx, colorMap, accent, selId, t, zoomLevel } = pc;
  const baseColor = colorMap.fires || accent;
  const scale = zoomScale(zoomLevel);
  const pulseIntensity = clamp01((zoomLevel - 1.5) / 2.5);
  for (let index = 0; index < state.ids.length; index++) {
    const projectedOffset = index * PACKED_UNIT_VECTOR_COMPONENTS;
    const x = state.projected[projectedOffset];
    const y = state.projected[projectedOffset + 1];
    const depth = state.projected[projectedOffset + 2];
    const id = state.ids[index];
    const frp = state.frp[index];
    const timestamp = state.timestamps[index];
    if (
      x === undefined ||
      y === undefined ||
      depth === undefined ||
      depth <= 0 ||
      id === undefined ||
      frp === undefined ||
      timestamp === undefined
    ) {
      continue;
    }

    const age = fireAgeFactor(timestamp);
    const color = fireColor(age, baseColor);
    const selected = id === selId;
    const size = fireSize(frp) * scale * (selected ? 2 : 1);
    const fillAlpha = (0.4 + depth * 0.6) * age * 0.5;
    if (frp > 15 && pulseIntensity > 0.01) {
      const pulseIndex = Math.min(1, (frp - 15) / 85);
      const phase = (Number.parseInt(id.slice(2), 36) || 0) * 0.6;
      const pulse =
        1 +
        Math.sin(t + phase) * (0.05 + pulseIndex * 0.15);
      const glowRadius =
        size * (1.5 + pulseIndex * 1.5) * pulse;
      drawGlow(
        ctx,
        color,
        "30",
        x,
        y,
        glowRadius,
        fillAlpha * pulseIntensity * 0.35,
      );
    }
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      drawSelectionRing(ctx, x, y, size, color, t);
    }
  }
  ctx.globalAlpha = 1;
}

/** Draw one projected point by its type. Each branch returns after drawing. */
type PointDraw = Readonly<{
  x: number;
  y: number;
  baseColor: string;
  depthAlpha: number;
  isSel: boolean;
  env: DotEnv;
}>;

const PULSE_ZOOM_FLOOR = 1.3;
const PULSE_ZOOM_SPAN = 2;

function pulseIntensity(zoomLevel: number): number {
  return clamp01((zoomLevel - PULSE_ZOOM_FLOOR) / PULSE_ZOOM_SPAN);
}

function drawEventPoint(
  item: Extract<RenderPoint, { type: "events" }>,
  d: PointDraw,
  zoomLevel: number,
): void {
  const sev = item.data.severity ?? 1;
  const ageFactor = eventAgeFactor(item.timestamp);
  const s = eventSize(sev) * zoomScale(zoomLevel) * (d.isSel ? 2 : 1);
  drawPulsingDot(d.env, {
    x: d.x,
    y: d.y,
    s,
    color: eventColor(ageFactor, d.baseColor),
    fillAlpha: d.depthAlpha * ageFactor * 0.75,
    isSel: d.isSel,
    glow:
      sev >= 3
        ? {
            intensity: pulseIntensity(zoomLevel),
            pulseIndex: Math.min(1, (sev - 2) / 3),
            id: item.id,
            cfg: EVENT_PULSE_GLOW,
          }
        : null,
    shape: (size) => {
      d.env.ctx.beginPath();
      d.env.ctx.arc(d.x, d.y, size, 0, Math.PI * 2);
    },
  });
}

function drawWeatherPoint(
  item: Extract<RenderPoint, { type: "weather" }>,
  d: PointDraw,
  zoomLevel: number,
): void {
  const severity = item.data.severity || "Unknown";
  const rank = weatherSeverityRank(severity);
  const marker = weatherMarker(severity);
  drawPulsingDot(d.env, {
    x: d.x,
    y: d.y,
    s: marker.size * zoomScale(zoomLevel) * (d.isSel ? 2 : 1),
    color: d.baseColor,
    fillAlpha: d.depthAlpha * marker.alpha * 0.8,
    isSel: d.isSel,
    glow:
      rank >= 3
        ? {
            intensity: pulseIntensity(zoomLevel),
            pulseIndex: Math.min(1, (rank - 2) / 2),
            id: item.id,
            cfg: WEATHER_PULSE_GLOW,
          }
        : null,
    shape: (size) => {
      const { ctx } = d.env;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - size * 1.2);
      ctx.lineTo(d.x + size * 0.8, d.y);
      ctx.lineTo(d.x, d.y + size * 1.2);
      ctx.lineTo(d.x - size * 0.8, d.y);
      ctx.closePath();
    },
  });
}

/**
 * The legacy point path. Aircraft, ships, quakes and fires are drawn from
 * their worker-owned scenes and never arrive here.
 */
function drawPoint(pc: PointDrawCtx, pt: ProjPoint): void {
  const { ctx, projFn, colorMap, accent, selId, t, zoomLevel } = pc;
  const { x, y, z, item } = pt;
  const d: PointDraw = {
    x,
    y,
    baseColor: colorMap[item.type] || accent,
    depthAlpha: 0.4 + z * 0.6,
    isSel: item.id === selId,
    env: { ctx, t, zoomLevel },
  };

  switch (item.type) {
    case "events":
      drawEventPoint(item, d, zoomLevel);
      return;
    case "weather":
      drawWeatherPoint(item, d, zoomLevel);
      return;
    case "cyclones":
      drawCyclone(
        ctx,
        projFn,
        x,
        y,
        item,
        d.baseColor,
        d.depthAlpha,
        t,
        d.isSel,
        {
          showForecast: pc.showForecast,
          showCone: pc.showCone,
          showWindField: pc.showWindField,
          showModels: pc.showModels,
          hiddenModels: pc.hiddenModels,
          reducedMotion: pc.reducedMotion,
        },
      );
      return;
    case "cyclones-forecast":
      drawCycloneForecastPoint(
        ctx,
        x,
        y,
        item.data.fcstHour,
        colorMap.cyclones || d.baseColor,
        d.depthAlpha,
        { isSelected: d.isSel, t, reducedMotion: pc.reducedMotion },
      );
      return;
    default:
      return;
  }
}

type StaticLayerCtx = {
  ctx: Ctx;
  projFn: ProjFn;
  globeMatrix: GlobeRotationMatrix;
  colors: RenderWorkerColors;
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
    drawLand(ctx, projFn, {
      matrix: s.globeMatrix,
      colors,
      isFlat: false,
      horizon: { gcx: cx, gcy: cy, gr: r - 0.5 },
      alpha: landAlpha,
    });
    drawGrid(ctx, projFn, { isFlat: false, accentColor: colors.grid || colors.accent, gridAlpha });
    return;
  }
  const fm = s.fm;
  if (!fm) return;
  ctx.fillStyle = colors.oceanDeep || "#081018";
  ctx.fillRect(fm.mx, fm.my, fm.mW, fm.mH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(fm.mx, fm.my, fm.mW, fm.mH);
  ctx.clip();
  drawLand(ctx, projFn, {
    matrix: s.globeMatrix,
    colors,
    isFlat: true,
    horizon: { gcx: 0, gcy: 0, gr: 0 },
    alpha: landAlpha,
  });
  drawGrid(ctx, projFn, {
    isFlat: true, cx, cy, mW: fm.mW, mH: fm.mH, mx: fm.mx, my: fm.my,
    accentColor: colors.grid || colors.accent, gridAlpha,
  });
}

type FlatMetrics = ReturnType<typeof getFlatMetrics>;

type SceneGeometry = Readonly<{
  width: number;
  height: number;
  fm: FlatMetrics | null;
  globeMatrix: GlobeRotationMatrix;
  centerX: number;
  centerY: number;
  globeRadius: number;
}>;

/** Flat and globe projection inputs, identical for every typed scene layer. */
function sceneProjectionBase(geometry: SceneGeometry) {
  const { fm } = geometry;
  return {
    width: geometry.width,
    height: geometry.height,
    hitCellSize: CAMERA_POLICY.hitCellSizePx,
    cullMargin: PACKED_CULL_MARGIN_PX,
    flat: fm
      ? {
          centerX: fm.cx,
          centerY: fm.cy,
          mapWidth: fm.mW,
          mapHeight: fm.mH,
        }
      : null,
    globe: fm
      ? null
      : {
          matrix: geometry.globeMatrix,
          centerX: geometry.centerX,
          centerY: geometry.centerY,
          radius: geometry.globeRadius,
        },
  };
}

const FIRE_LAYER_PRECEDES: ReadonlySet<string> = new Set([
  "events",
  "weather",
  "cyclones-forecast",
  "cyclones",
]);

const EARTHQUAKE_LAYER_PRECEDES: ReadonlySet<string> = new Set([
  "weather",
  "cyclones-forecast",
  "cyclones",
]);

/**
 * Packed fires and earthquakes are single draw calls, so they slot into the
 * legacy point order at the first point they must sit beneath.
 */
function drawPointLayers(
  pointCtx: PointDrawCtx,
  pts: readonly ProjPoint[],
): void {
  let firesDrawn = false;
  let earthquakesDrawn = false;

  const drawFires = (): void => {
    if (firesDrawn || !_fires) return;
    drawFireLayer(pointCtx, _fires);
    firesDrawn = true;
  };
  const drawEarthquakes = (): void => {
    if (earthquakesDrawn || !_earthquakes) return;
    drawFires();
    drawEarthquakeLayer(pointCtx, _earthquakes);
    earthquakesDrawn = true;
  };

  for (const pt of pts) {
    if (FIRE_LAYER_PRECEDES.has(pt.item.type)) drawFires();
    if (EARTHQUAKE_LAYER_PRECEDES.has(pt.item.type)) drawEarthquakes();
    drawPoint(pointCtx, pt);
  }
  drawFires();
  drawEarthquakes();
}

type AreaOverlayOptions = Readonly<{
  ctx: Ctx;
  projFn: ProjFn;
  isFlat: boolean;
  centerX: number;
  centerY: number;
  globeRadius: number;
  selectedId: string | null;
  time: number;
  showWarnings: boolean;
  showWeather: boolean;
}>;

/** Tropical watch/warning and NWS alert polygons, under every marker. */
function drawAreaOverlays(options: AreaOverlayOptions): void {
  const gr = options.isFlat ? 0 : options.globeRadius - 0.5;
  const env = {
    ctx: options.ctx,
    proj: options.projFn,
    isFlat: options.isFlat,
    gcx: options.centerX,
    gcy: options.centerY,
    gr,
    prims: { simpleDraw, drawClippedPoly },
  };
  if (options.showWarnings && _warnings && _warnings.length > 0) {
    drawWarnings(
      env,
      _warnings,
      { warn: _warnColor, watch: _watchColor },
      options.selectedId,
      options.time,
    );
  }
  if (options.showWeather && _wxAlerts && _wxAlerts.length > 0) {
    drawWarnings(
      env,
      _wxAlerts,
      { warn: _wxWarnColor, watch: _wxWatchColor },
      options.selectedId,
      options.time,
    );
  }
}

const FLAT_LABEL_MIN_PX = 8;
const FLAT_LABEL_SCALE = 0.015;
const FLAT_LONGITUDE_STEP = 60;
const FLAT_LONGITUDE_LIMIT = 120;
const FLAT_LATITUDE_STEP = 30;
const FLAT_LATITUDE_LIMIT = 60;

/** Map border plus the degree labels down its outer edges. */
function drawFlatFrame(
  ctx: Ctx,
  fm: FlatMetrics,
  colors: RenderWorkerColors,
  viewport: Readonly<{ width: number; height: number }>,
  light: boolean,
): void {
  ctx.strokeStyle = colors.accent + (light ? "25" : "1a");
  ctx.lineWidth = 1;
  ctx.strokeRect(fm.mx, fm.my, fm.mW, fm.mH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.dim || colors.accent;
  const fontSize = Math.max(
    FLAT_LABEL_MIN_PX,
    Math.min(viewport.width, viewport.height) * FLAT_LABEL_SCALE,
  );
  ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
  ctx.textAlign = "center";
  for (
    let lon = -FLAT_LONGITUDE_LIMIT;
    lon <= FLAT_LONGITUDE_LIMIT;
    lon += FLAT_LONGITUDE_STEP
  ) {
    ctx.fillText(
      `${Math.abs(lon)}°${lon >= 0 ? "E" : "W"}`,
      fm.cx + (lon / 180) * (fm.mW / 2),
      fm.my + fm.mH + 13,
    );
  }
  ctx.textAlign = "right";
  for (
    let lat = -FLAT_LATITUDE_LIMIT;
    lat <= FLAT_LATITUDE_LIMIT;
    lat += FLAT_LATITUDE_STEP
  ) {
    ctx.fillText(
      `${Math.abs(lat)}°${lat >= 0 ? "N" : "S"}`,
      fm.mx - 5,
      fm.cy - (lat / 90) * (fm.mH / 2) + 3,
    );
  }
}

type FrameTheme = Readonly<{
  light: boolean;
  landAlpha: number;
  gridAlpha: number;
  glowAlpha: string;
  milColor: string;
  reconColor: string;
  colorMap: Record<string, string>;
}>;

const FALLBACK_COLORS = {
  fires: "#ff6600",
  weather: "#aa66ff",
  cyclones: "#ff66cc",
  reconLight: "#b86b00",
  reconDark: "#ff9500",
  militaryLight: "#3a3a3a",
  militaryDark: "#e0e0e0",
} as const;

function frameTheme(colors: RenderWorkerColors): FrameTheme {
  const light = isLightTheme(colors);
  return {
    light,
    landAlpha: light ? 0.9 : 0.7,
    gridAlpha: light ? 0.18 : 0.11,
    glowAlpha: light ? "08" : "0d",
    milColor: light
      ? FALLBACK_COLORS.militaryLight
      : FALLBACK_COLORS.militaryDark,
    reconColor:
      colors.recon ||
      (light ? FALLBACK_COLORS.reconLight : FALLBACK_COLORS.reconDark),
    colorMap: {
      ships: colors.ships,
      aircraft: colors.aircraft,
      events: colors.events,
      quakes: colors.quakes,
      fires: colors.fires || FALLBACK_COLORS.fires,
      weather: colors.weather || FALLBACK_COLORS.weather,
      cyclones: colors.cyclones || FALLBACK_COLORS.cyclones,
    },
  };
}

type CycloneDisplay = Readonly<{
  showForecast: boolean;
  showCone: boolean;
  showWindField: boolean;
  showWarnings: boolean;
  showModels: boolean;
  hiddenModels: Set<string>;
  reducedMotion: boolean;
}>;

/** Wind field and models default off; everything else defaults on. */
function cycloneDisplay(p: RenderPresentationPayload): CycloneDisplay {
  return {
    showForecast: p.cyclonesShowForecast !== false,
    showCone: p.cyclonesShowCone !== false,
    showWindField: p.cyclonesShowWindField === true,
    showWarnings: p.cyclonesShowWarnings !== false,
    showModels: p.cyclonesShowModels === true,
    hiddenModels: new Set(p.cyclonesHiddenModels ?? []),
    reducedMotion: p.prefersReducedMotion === true,
  };
}

/** Progressive reveal: advance the counter one chunk and slice to it. */
function advanceReveal(
  fullData: readonly RenderPoint[],
): readonly RenderPoint[] {
  _revealCount =
    _revealCount < fullData.length
      ? Math.min(_revealCount + REVEAL_CHUNK, fullData.length)
      : fullData.length;
  return _revealCount < fullData.length
    ? fullData.slice(0, _revealCount)
    : fullData;
}

function resizeCanvas(
  target: OffscreenCanvas,
  context: Ctx,
  viewport: Readonly<{ width: number; height: number; devicePixelRatio: number }>,
): void {
  const { width, height, devicePixelRatio: dpr } = viewport;
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (target.width !== pixelWidth || target.height !== pixelHeight) {
    target.width = pixelWidth;
    target.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
}

type SelectionVisibility = Readonly<{
  selectedItem: RenderPresentationPayload["selectedItem"];
  searchSet: Set<string> | null;
  isoMode: RenderPresentationPayload["isolateMode"];
  isoId: string | null;
  isolatedType: string | null;
  layers: RenderPresentationPayload["layers"];
  aircraftView: ReturnType<typeof aircraftSceneStore.view>;
  aircraftFilter: AircraftSceneFilter;
}>;

/** The trail and route only draw when the selection survives the filters. */
function selectionPassesFilters(v: SelectionVisibility): boolean {
  const item = v.selectedItem;
  if (!item) return false;
  if (v.searchSet && !v.searchSet.has(item.id)) return false;
  if (v.isoMode === "solo" && item.id !== v.isoId) return false;
  if (
    v.isoMode === "focus" &&
    v.isolatedType &&
    item.type !== v.isolatedType
  ) {
    return false;
  }
  if (item.type !== "aircraft") return v.layers[item.type] !== false;

  const handle = aircraftSceneStore.handleForId(item.id);
  return (
    handle !== null &&
    aircraftSceneIncludes(v.aircraftView, handle - 1, v.aircraftFilter)
  );
}

type FrameInputs = Readonly<{
  canvas: OffscreenCanvas;
  ctx: Ctx;
  data: RenderPoint[];
  colors: RenderWorkerColors;
  presentation: RenderPresentationPayload;
  viewport: RenderViewportPayload;
}>;

/** Everything a frame needs, or null while the worker is still being set up. */
function frameInputs(): FrameInputs | null {
  if (
    !canvas ||
    !ctx ||
    !_data ||
    !_colors ||
    !_presentation ||
    !_viewport
  ) {
    return null;
  }
  return {
    canvas,
    ctx,
    data: _data,
    colors: _colors,
    presentation: _presentation,
    viewport: _viewport,
  };
}

type Projectors = Readonly<{
  projectPoint: PointProjector;
  projFn: ProjFn;
}>;

/**
 * Aircraft and ships never reach the point projector; they project from their
 * typed scene, which carries its own interpolation.
 */
function createProjectors(
  geometry: SceneGeometry,
  rotationY: number,
  rotationX: number,
): Projectors {
  const { fm, centerX, centerY, globeRadius, globeMatrix } = geometry;
  if (fm) {
    return {
      projectPoint: (item) =>
        projFlat(item.lat, item.lon, fm.cx, fm.cy, fm.mW, fm.mH),
      projFn: (lat, lon) => projFlat(lat, lon, fm.cx, fm.cy, fm.mW, fm.mH),
    };
  }
  return {
    projectPoint: (item) =>
      projectUnitVector(
        unitVectorForPoint(item),
        globeMatrix,
        centerX,
        centerY,
        globeRadius,
      ),
    projFn: (lat, lon) =>
      projGlobe(lat, lon, centerX, centerY, globeRadius, rotationY, rotationX),
  };
}

/** Globe rim or flat-map border, drawn after the point clip is released. */
function drawFrameEdge(
  ctx: Ctx,
  geometry: SceneGeometry,
  colors: RenderWorkerColors,
  light: boolean,
): void {
  const { fm, centerX, centerY, globeRadius } = geometry;
  if (!fm) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, globeRadius, 0, Math.PI * 2);
    ctx.strokeStyle = colors.accent + (light ? "30" : "1f");
    ctx.lineWidth = 1.5;
    ctx.stroke();
    return;
  }
  drawFlatFrame(
    ctx,
    fm,
    colors,
    { width: geometry.width, height: geometry.height },
    light,
  );
}

type ProjectFrameOptions = Readonly<{
  data: readonly RenderPoint[];
  projectPoint: PointProjector;
  geometry: SceneGeometry;
  presentation: RenderPresentationPayload;
  showForecast: boolean;
}>;

type ProjectedFrame = Readonly<{
  pts: ProjPoint[];
  searchSet: Set<string> | null;
  isolatedType: string | null;
  filterCfg: FilterCfg;
  aircraftView: ReturnType<typeof aircraftSceneStore.view>;
  aircraftSceneFilter: AircraftSceneFilter;
  shipView: ReturnType<typeof shipSceneStore.view>;
}>;

/**
 * One pass over the legacy points plus one over each typed scene. Isolation
 * needs the isolated item's type, which only the selection or a lookup knows.
 */
function projectFrame(options: ProjectFrameOptions): ProjectedFrame {
  const p = options.presentation;
  const { isolatedId: isoId, selectedId: selId, isolateMode: isoMode } = p;
  const isolatedType =
    isoId && selId
      ? p.selectedItem?.type ??
        options.data.find((candidate) => candidate.id === isoId)?.type ??
        null
      : null;
  const searchSet = p.searchMatchIds ? new Set(p.searchMatchIds) : null;
  const filterCfg: FilterCfg = {
    searchSet,
    isoMode,
    isoId,
    isolatedType,
    layers: p.layers,
    af: p.aircraftFilter,
    earthquakeMinMagnitude: p.earthquakeMinMagnitude,
    fireMinConfidence: p.fireMinConfidence,
    showForecast: options.showForecast,
  };
  const pts = projectAndFilter(options.data, options.projectPoint, filterCfg);
  rebuildHitGrid(pts);

  const base = sceneProjectionBase(options.geometry);
  const aircraftView = aircraftSceneStore.view();
  const aircraftSceneFilter: AircraftSceneFilter = {
    filter: p.aircraftFilter,
    searchIds: searchSet,
    isolateMode: isoMode,
    isolatedId: isoId,
    isolatedType,
  };
  aircraftProjection.project(aircraftView, {
    ...base,
    includes: (index) =>
      aircraftSceneIncludes(aircraftView, index, aircraftSceneFilter),
  });

  const shipView = shipSceneStore.view();
  const shipSceneFilter: ShipSceneFilter = {
    enabled: p.layers.ships !== false,
    searchIds: searchSet,
    isolateMode: isoMode,
    isolatedId: isoId,
    isolatedType,
  };
  shipProjection.project(shipView, {
    ...base,
    includes: (index) => shipSceneIncludes(shipView, index, shipSceneFilter),
  });

  return {
    pts,
    searchSet,
    isolatedType,
    filterCfg,
    aircraftView,
    aircraftSceneFilter,
    shipView,
  };
}

/**
 * Where the selection landed this frame, for the side-of-screen readout. The
 * typed aircraft scene wins over the legacy point when both resolve.
 */
function updateSelectedProjection(
  pts: readonly ProjPoint[],
  selectedId: string | null,
): void {
  _hasSelectedProjection = false;
  if (selectedId === null) return;

  const point = pts.find((candidate) => candidate.item.id === selectedId);
  if (point) {
    _hasSelectedProjection = true;
    _selectedProjectionX = point.x;
    _selectedProjectionDepth = point.z;
  }

  const handle = aircraftSceneStore.handleForId(selectedId);
  const projection =
    handle === null ? null : aircraftProjection.projection(handle - 1);
  if (!projection) return;
  _hasSelectedProjection = true;
  _selectedProjectionX = projection.x;
  _selectedProjectionDepth = projection.depth;
}

function scheduleNextFrameIfNeeded(
  hasRevealWork: boolean,
  reducedMotion: boolean,
  hasSelection: boolean,
  cameraActive: boolean,
): void {
  const hasVisualAnimation =
    !reducedMotion &&
    (_hasAnimatedPoints ||
      _hasAnimatedEarthquakes ||
      _hasAnimatedFires ||
      hasSelection);
  const needsFrame =
    hasRevealWork || trailMap.size > 0 || hasVisualAnimation || cameraActive;
  if (!needsFrame || _frameScheduled) return;
  _frameScheduled = true;
  requestAnimationFrame(renderFrame);
}

function renderFrame(): void {
  _frameScheduled = false;
  const inputs = frameInputs();
  if (!inputs) return;

  const { canvas, ctx, presentation: p, colors, viewport } = inputs;
  const { width: W, height: H } = viewport;
  const isFlat = p.flat;
  const now = performance.now();
  const cameraActive = stepCamera(
    _camera,
    _cameraTarget,
    _pointer,
    { width: W, height: H },
    isFlat,
    p.autoRotate,
    p.rotationSpeed,
    selectedCameraPosition(),
    now - _lastFrameAt,
  );
  _lastFrameAt = now;
  const cam = cameraSnapshot(_camera);
  const t = Date.now() * 0.003;
  const selId = p.selectedId;
  const isoId = p.isolatedId;
  const isoMode = p.isolateMode;
  const { layers } = p;

  const fullData = inputs.data;
  const data = advanceReveal(fullData);
  const selectedItem = p.selectedItem;

  const zoomLevel = isFlat ? cam.zoomFlat : cam.zoomGlobe;
  const { light, landAlpha, gridAlpha, glowAlpha, milColor, reconColor, colorMap } =
    frameTheme(colors);

  resizeCanvas(canvas, ctx, viewport);

  const cx = W / 2;
  const cy = H / 2;
  const cyclones = cycloneDisplay(p);

  const fm = isFlat ? getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY) : null;
  const globeR = Math.min(W, H) * 0.4 * cam.zoomGlobe;
  const geometry: SceneGeometry = {
    width: W,
    height: H,
    fm,
    globeMatrix: createGlobeRotationMatrix(cam.rotY, cam.rotX),
    centerX: cx,
    centerY: cy,
    globeRadius: globeR,
  };
  const { projectPoint, projFn } = createProjectors(
    geometry,
    cam.rotY,
    cam.rotX,
  );
  const { globeMatrix } = geometry;

  // ── Draw static layer (leaves clip active for the points) ─────
  drawStaticLayer({ ctx, projFn, globeMatrix, colors, isFlat, W, H, cx, cy, globeR, fm, landAlpha, gridAlpha, glowAlpha });

  drawAreaOverlays({
    ctx,
    projFn,
    isFlat,
    centerX: cx,
    centerY: cy,
    globeRadius: globeR,
    selectedId: selId ?? null,
    time: t,
    showWarnings: cyclones.showWarnings,
    showWeather: layers.weather !== false,
  });

  // ── Project + filter points ───────────────────────────────────
  const projected = projectFrame({
    data,
    projectPoint,
    geometry,
    presentation: p,
    showForecast: cyclones.showForecast,
  });
  const {
    pts,
    searchSet,
    isolatedType,
    filterCfg,
    aircraftView,
    aircraftSceneFilter,
    shipView,
  } = projected;
  updateSelectedProjection(pts, selId);
  const packedFrame: PackedProjectionFrame = {
    width: W,
    height: H,
    flatMetrics: fm,
    globeMatrix,
    centerX: cx,
    centerY: cy,
    globeRadius: globeR,
    filters: filterCfg,
    selectedId: selId,
  };
  if (_earthquakes) projectEarthquakes(_earthquakes, packedFrame);
  if (_fires) projectFires(_fires, packedFrame);

  // ── Draw trail (only if the selected item passes current filters) ──
  const drawSelectedTrail = selectionPassesFilters({
    selectedItem,
    searchSet,
    isoMode,
    isoId,
    isolatedType,
    layers,
    aircraftView,
    aircraftFilter: aircraftSceneFilter,
  });

  if (drawSelectedTrail && selectedItem?.route) {
    const routePos = getInterp(selectedItem.id);
    drawRoute(
      ctx,
      projFn,
      selectedItem.route,
      routePos ? routePos.lat : selectedItem.lat,
      routePos ? routePos.lon : selectedItem.lon,
      colors,
    );
  }
  const hitTargets = drawSelectedTrail ? drawTrail(ctx, projFn, selectedItem ?? null, colors) : [];
  _trailHitTargets = hitTargets;
  ctx.globalAlpha = 1;

  // ── Draw points ───────────────────────────────────────────────
  const pointCtx: PointDrawCtx = {
    ctx, projFn, colorMap, accent: colors.accent, selId, t, zoomLevel,
    showForecast: cyclones.showForecast,
    showCone: cyclones.showCone,
    showWindField: cyclones.showWindField,
    showModels: cyclones.showModels,
    hiddenModels: cyclones.hiddenModels,
    reducedMotion: cyclones.reducedMotion,
  };
  drawShipScene(shipView, shipProjection, {
    context: ctx,
    color: colorMap.ships ?? colors.accent,
    selectedId: selId,
    time: t,
    zoomLevel,
  });
  drawAircraftScene(aircraftView, aircraftProjection, {
    context: ctx,
    baseColor: colors.aircraft,
    militaryColor: milColor,
    reconColor,
    selectedId: selId,
    time: t,
    zoomLevel,
  });
  drawPointLayers(pointCtx, pts);
  ctx.globalAlpha = 1;

  // ── Restore clip and draw rim/border ──────────────────────────
  ctx.restore();

  drawFrameEdge(ctx, geometry, colors, light);

  updateSelectedSide();
  updateTrailTooltip();
  postCameraSummary(now);

  scheduleNextFrameIfNeeded(
    _revealCount < fullData.length,
    cyclones.reducedMotion,
    p.selectedId !== null,
    cameraActive,
  );
}
