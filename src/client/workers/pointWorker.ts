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
import { createRenderSceneStore } from "./render/sceneStore";
import {
  aircraftSceneIncludes,
  drawAircraftScene,
  type AircraftSceneFilter,
} from "./render/scene/aircraftLayer";
import { createProjectedSceneLayer } from "./render/scene/projectedLayer";
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
  advanceUnitMotion,
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

function getInterpUnit(id: string): UnitVector | null {
  const entry = trailMap.get(id);
  if (!entry) return null;
  const elapsedSeconds = interpolationSeconds(id, entry);
  return elapsedSeconds === null
    ? null
    : advanceUnitMotion(entry.motion, elapsedSeconds);
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

function weatherSize(sev: string): number {
  const r = weatherSeverityRank(sev);
  return r >= 4 ? 6 : r >= 3 ? 4.5 : r >= 2 ? 3 : r >= 1 ? 2 : 1.5;
}
function weatherAlpha(sev: string): number {
  const r = weatherSeverityRank(sev);
  return r >= 4 ? 1 : r >= 3 ? 0.9 : r >= 2 ? 0.75 : 0.6;
}

// ── Aircraft filter ─────────────────────────────────────────────────

type AircraftData = Extract<
  RenderPoint,
  { type: "aircraft" }
>["data"];
type AircraftFilter = RenderAircraftFilter;

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
const typedScenes = new Map(
  RENDER_SOURCE_IDS.map((source) => [
    source,
    source === "aircraft"
      ? aircraftSceneStore
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
      if (command.type === "earthquakeSearch") {
        _earthquakeSearchIds = command.matchingIds
          ? new Set(command.matchingIds)
          : null;
      } else if (command.type === "fireSearch") {
        _fireSearchIds = command.matchingIds
          ? new Set(command.matchingIds)
          : null;
      } else if (command.type === "earthquakeRebase") {
        handleEarthquakeRebase(command);
      } else if (command.type === "fireRebase") {
        handleFireRebase(command);
      }
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
    if (sceneCommand.source === "aircraft" && _dataBySource) {
      _dataBySource.aircraft = null;
      if (_pendingBuckets) _pendingBuckets.aircraft = null;
      rebuildGenericData();
    }
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
    previous &&
    previous.rotY === snapshot.rotY &&
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
  if (_dataBySource) {
    _dataBySource.quakes = null;
    if (_pendingBuckets) _pendingBuckets.quakes = null;
  }
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
  if (_dataBySource) {
    _dataBySource.fires = null;
    if (_pendingBuckets) _pendingBuckets.fires = null;
  }
  rebuildGenericData();
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
    const usesTypedAircraft =
      item.type === "aircraft" &&
      aircraftSceneStore.version() > 0;
    if (
      item.type !== "quakes" &&
      item.type !== "fires" &&
      !usesTypedAircraft
    ) {
      pending.push(item);
    }
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

function handleCameraInput(payload: RenderInputPayload): void {
  if (!_viewport || !_presentation) return;
  const viewport = {
    width: _viewport.width,
    height: _viewport.height,
  };
  const flat = _presentation.flat;

  if (payload.kind === "pointer") {
    if (payload.phase === "hover") {
      handlePointerHover(payload.x, payload.y);
      return;
    }
    if (payload.phase === "start") {
      beginCameraPointer(
        _camera,
        _pointer,
        viewport,
        flat,
        payload.x,
        payload.y,
      );
      postCursor({
        kind: "cursor",
        cursor: _pointer.interactive ? "grabbing" : "default",
      });
    } else if (payload.phase === "move") {
      moveCameraPointer(
        _camera,
        _cameraTarget,
        _pointer,
        viewport,
        flat,
        payload.x,
        payload.y,
      );
    } else if (payload.phase === "end") {
      const click = endCameraPointer(_pointer);
      if (click) handlePointerClick(click);
      postCursor({ kind: "cursor", cursor: "default" });
    } else {
      cancelCameraPointer(_pointer);
      postCursor({ kind: "cursor", cursor: "default" });
    }
    scheduleRender();
    return;
  }

  if (payload.kind === "pinch") {
    if (payload.phase === "start") {
      beginCameraPinch(_pointer, payload.distance);
    } else if (payload.phase === "move") {
      moveCameraPinch(
        _camera,
        _cameraTarget,
        _pointer,
        viewport,
        flat,
        payload.centerX,
        payload.centerY,
        payload.distance,
      );
    } else {
      endCameraPinch(_pointer);
    }
    scheduleRender();
    return;
  }

  if (payload.kind === "wheel") {
    applyCameraWheel(
      _camera,
      _cameraTarget,
      viewport,
      flat,
      payload.x,
      payload.y,
      payload.deltaY,
    );
    scheduleRender();
    return;
  }

  applyCameraKey(
    _camera,
    viewport,
    flat,
    payload.code,
  );
  scheduleRender();
}


globalThis.onmessage = (e: MessageEvent<RenderWorkerCommand>) => {
  const msg = e.data;
  if (!acceptRenderCommand(protocolState, msg)) return;
  if (msg.type === "init") {
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
    return;
  }
  if (msg.type === "trails") {
    handleTrails(msg);
    scheduleRender();
    return;
  }
  if (msg.type === "warnings") {
    _warnings = [...msg.payload.features];
    _warnColor = msg.payload.warningColor;
    _watchColor = msg.payload.watchColor;
    scheduleRender();
    return;
  }
  if (msg.type === "weatherAlerts") {
    _wxAlerts = [...msg.payload.features];
    _wxWarnColor = msg.payload.warningColor;
    _wxWatchColor = msg.payload.watchColor;
    scheduleRender();
    return;
  }
  if (msg.type === "viewport") {
    _viewport = msg.payload;
    scheduleRender();
    return;
  }
  if (msg.type === "presentation") {
    _presentation = msg.payload;
    scheduleRender();
    return;
  }
  if (msg.type === "focus") {
    if (_viewport && _presentation) {
      focusCamera(
        _camera,
        _cameraTarget,
        {
          id: msg.payload.id,
          latitude: msg.payload.latitude,
          longitude: msg.payload.longitude,
        },
        {
          width: _viewport.width,
          height: _viewport.height,
        },
        _presentation.flat,
        msg.payload.kind,
      );
      scheduleRender();
    }
    return;
  }
  if (msg.type === "input") {
    handleCameraInput(msg.payload);
    return;
  }
  if (msg.type === "dispose") {
    dataPort?.close();
    dataPort = null;
    canvas = null;
    ctx = null;
    _presentation = null;
    _viewport = null;
    _frameScheduled = false;
    return;
  }
  if (msg.type === "data") {
    if (handleData(msg.payload)) scheduleRender();
    return;
  }
};

// ── Render everything ───────────────────────────────────────────────


// ── Per-type point drawing (extracted from the render loop) ─────────

type DotEnv = { ctx: Ctx; t: number; zoomLevel: number };

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

function projectPackedSource(
  state: PackedProjectionState,
  frame: PackedProjectionFrame,
  pointType: "quakes" | "fires",
  searchIds: ReadonlySet<string> | null,
  passesSourceFilter: (index: number) => boolean,
): void {
  preparePackedHitGrid(state, frame.width, frame.height);
  const visible =
    frame.filters.layers[pointType] !== false &&
    !(
      frame.filters.isoMode === "focus" &&
      frame.filters.isolatedType &&
      frame.filters.isolatedType !== pointType
    );
  for (let index = 0; index < state.ids.length; index++) {
    const projectedOffset = index * PACKED_UNIT_VECTOR_COMPONENTS;
    state.projected[projectedOffset + 2] = -1;
    if (!visible || !passesSourceFilter(index)) continue;
    const id = state.ids[index];
    if (id === undefined || (searchIds && !searchIds.has(id))) continue;
    if (frame.filters.isoMode === "solo" && id !== frame.filters.isoId) {
      continue;
    }

    let projectedX: number;
    let projectedY: number;
    let depth: number;
    if (frame.flatMetrics) {
      const positionOffset = index * PACKED_POSITION_COMPONENTS;
      const longitude = state.positions[positionOffset];
      const latitude = state.positions[positionOffset + 1];
      if (longitude === undefined || latitude === undefined) continue;
      projectedX =
        frame.flatMetrics.cx +
        (longitude / 180) * (frame.flatMetrics.mW / 2);
      projectedY =
        frame.flatMetrics.cy -
        (latitude / 90) * (frame.flatMetrics.mH / 2);
      depth = 1;
    } else {
      const unitX = state.unitVectors[projectedOffset];
      const unitY = state.unitVectors[projectedOffset + 1];
      const unitZ = state.unitVectors[projectedOffset + 2];
      if (
        unitX === undefined ||
        unitY === undefined ||
        unitZ === undefined
      ) {
        continue;
      }
      const matrix = frame.globeMatrix;
      const rotatedX =
        matrix.m00 * unitX +
        matrix.m01 * unitY +
        matrix.m02 * unitZ;
      const rotatedY =
        matrix.m10 * unitX +
        matrix.m11 * unitY +
        matrix.m12 * unitZ;
      depth =
        matrix.m20 * unitX +
        matrix.m21 * unitY +
        matrix.m22 * unitZ;
      if (depth <= 0) continue;
      projectedX = frame.centerX + rotatedX * frame.globeRadius;
      projectedY = frame.centerY - rotatedY * frame.globeRadius;
    }
    if (
      projectedX < -PACKED_CULL_MARGIN_PX ||
      projectedY < -PACKED_CULL_MARGIN_PX ||
      projectedX >= frame.width + PACKED_CULL_MARGIN_PX ||
      projectedY >= frame.height + PACKED_CULL_MARGIN_PX
    ) {
      continue;
    }

    state.projected[projectedOffset] = projectedX;
    state.projected[projectedOffset + 1] = projectedY;
    state.projected[projectedOffset + 2] = depth;
    if (id === frame.selectedId) {
      _hasSelectedProjection = true;
      _selectedProjectionX = projectedX;
      _selectedProjectionDepth = depth;
    }

    const column = Math.floor(
      projectedX / CAMERA_POLICY.hitCellSizePx,
    );
    const row = Math.floor(
      projectedY / CAMERA_POLICY.hitCellSizePx,
    );
    if (
      column < 0 ||
      row < 0 ||
      column >= state.hitColumns ||
      row >= state.hitRows
    ) {
      continue;
    }
    const cell = row * state.hitColumns + column;
    state.hitNext[index] = state.hitHeads[cell] ?? -1;
    state.hitHeads[cell] = index;
  }
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
  let closest: PointHit | null = null;
  let distance = radius;
  let inspected = 0;
  for (let row = centerRow - 1; row <= centerRow + 1; row++) {
    if (row < 0 || row >= state.hitRows) continue;
    for (
      let column = centerColumn - 1;
      column <= centerColumn + 1;
      column++
    ) {
      if (column < 0 || column >= state.hitColumns) continue;
      let index =
        state.hitHeads[row * state.hitColumns + column] ?? -1;
      while (index >= 0) {
        const projectedOffset = index * PACKED_UNIT_VECTOR_COMPONENTS;
        const projectedX = state.projected[projectedOffset];
        const projectedY = state.projected[projectedOffset + 1];
        const id = state.ids[index];
        const positionOffset = index * PACKED_POSITION_COMPONENTS;
        const longitude = state.positions[positionOffset];
        const latitude = state.positions[positionOffset + 1];
        if (
          projectedX !== undefined &&
          projectedY !== undefined &&
          id !== undefined &&
          longitude !== undefined &&
          latitude !== undefined
        ) {
          const candidateDistance = Math.hypot(
            projectedX - x,
            projectedY - y,
          );
          if (candidateDistance < distance) {
            closest = {
              id,
              latitude,
              longitude,
              distance: candidateDistance,
              pointType,
            };
            distance = candidateDistance;
          }
        }
        inspected++;
        if (inspected >= CAMERA_POLICY.maximumHitCandidates) {
          return closest;
        }
        index = state.hitNext[index] ?? -1;
      }
    }
  }
  return closest;
}

function nearestAircraftPoint(
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  const hit = aircraftProjection.nearest(
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
    pointType: "aircraft",
  };
}

function nearestPoint(
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  let closest = nearestGenericPoint(x, y, radius);
  const specialized = [
    nearestAircraftPoint(x, y, radius),
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
  milColor: string;
  reconColor: string;
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
function drawPoint(pc: PointDrawCtx, pt: ProjPoint): void {
  const { ctx, projFn, colorMap, accent, selId, t, zoomLevel, milColor, reconColor } = pc;
  const { x, y, z, item } = pt;
  const baseColor = colorMap[item.type] || accent;
  const depthAlpha = 0.4 + z * 0.6;
  const isSel = item.id === selId;
  const id = item.id;
  const ts = item.timestamp;
  const env: DotEnv = { ctx, t, zoomLevel };
  const circle = (s: number) => { ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); };
  if (item.type === "events") {
    const sev = item.data.severity ?? 1;
    const af2 = eventAgeFactor(ts);
    const color = eventColor(af2, baseColor);
    const s = eventSize(sev) * zoomScale(zoomLevel) * (isSel ? 2 : 1);
    drawPulsingDot(env, x, y, s, color, depthAlpha * af2 * 0.75, isSel,
      sev >= 3 ? { intensity: clamp01((zoomLevel - 1.3) / 2), pulseIndex: Math.min(1, (sev - 2) / 3), id, cfg: { idSliceFrom: 2, rate: 0.5, baseAmp: 0.1, ampGain: 0.2, radBase: 1.8, radGain: 1.2, alphaHex: "30", glowMul: 0.4 } } : null,
      circle);
    return;
  }

  if (item.type === "weather") {
    const wsev = item.data.severity || "Unknown";
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
    drawCyclone(ctx, projFn, x, y, item, baseColor, depthAlpha, t, isSel, {
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
    drawCycloneForecastPoint(ctx, x, y, item.data.fcstHour,
      colorMap.cyclones || baseColor, depthAlpha,
      { isSelected: isSel, t, reducedMotion: pc.reducedMotion });
    return;
  }

  if (item.type === "ships") {
    const shipAlpha = Math.min(0.85, 0.35 + Math.max(0, (zoomLevel - 1) / 2) * 0.5);
    const s = 2.5 * zoomScale(zoomLevel) * (isSel ? 2 : 1);
    const a = ((item.data.heading ?? 0) * Math.PI) / 180;
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

  if (item.type !== "aircraft") return;

  // Aircraft. Recon (Hurricane Hunter) outranks military.
  const isMil = Boolean(item.data.military);
  const isRecon = Boolean(item.data.recon);
  let acAlpha = Math.min(0.8, 0.2 + Math.max(0, (zoomLevel - 1) / 5) * 0.6);
  if (isMil) acAlpha = Math.min(0.9, acAlpha + 0.15);
  if (isRecon) acAlpha = Math.min(1, Math.max(acAlpha, 0.75) + 0.1);
  let acSize = Math.min(4, 1 + Math.max(0, (zoomLevel - 1) * 0.5));
  if (isMil) acSize = Math.min(5, acSize * 1.2);
  if (isRecon) acSize = Math.max(acSize, 2.2) * 1.2;
  if (isSel) acSize *= 2;
  const status = item.data.squawkStatus;
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
  const a = ((item.data.heading ?? 0) * Math.PI) / 180;
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

function renderFrame(): void {
  _frameScheduled = false;
  if (
    !canvas ||
    !ctx ||
    !_data ||
    !_colors ||
    !_presentation ||
    !_viewport
  ) {
    return;
  }

  const p = _presentation;
  const {
    width: W,
    height: H,
    devicePixelRatio: dpr,
  } = _viewport;
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
  const globeMatrix = createGlobeRotationMatrix(cam.rotY, cam.rotX);
  const projectPoint: PointProjector = fm
    ? (item) => {
        const interpolated =
          item.type === "aircraft" || item.type === "ships"
            ? getInterp(item.id)
            : null;
        return projFlat(
          interpolated?.lat ?? item.lat,
          interpolated?.lon ?? item.lon,
          fm.cx,
          fm.cy,
          fm.mW,
          fm.mH,
        );
      }
    : (item) => {
        const interpolated =
          item.type === "aircraft" || item.type === "ships"
            ? getInterpUnit(item.id)
            : null;
        return projectUnitVector(
          interpolated ?? unitVectorForPoint(item),
          globeMatrix,
          cx,
          cy,
          globeR,
        );
      };
  const projFn: ProjFn = fm
    ? (lat, lon) => projFlat(lat, lon, fm.cx, fm.cy, fm.mW, fm.mH)
    : (lat, lon) => projGlobe(lat, lon, cx, cy, globeR, cam.rotY, cam.rotX);

  // ── Draw static layer (leaves clip active for the points) ─────
  drawStaticLayer({ ctx, projFn, globeMatrix, colors, isFlat, W, H, cx, cy, globeR, fm, landAlpha, gridAlpha, glowAlpha });

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
    isoId && selId
      ? (
          selectedItem?.type ??
          data.find((candidate) => candidate.id === isoId)?.type ??
          null
        )
      : null;
  const searchSet = searchIds ? new Set(searchIds) : null;
  const filterCfg: FilterCfg = {
    searchSet,
    isoMode,
    isoId,
    isolatedType,
    layers,
    af,
    earthquakeMinMagnitude: p.earthquakeMinMagnitude,
    fireMinConfidence: p.fireMinConfidence,
    showForecast: cyclonesShowForecast,
  };
  const pts = projectAndFilter(data, projectPoint, filterCfg);
  rebuildHitGrid(pts);
  const aircraftView = aircraftSceneStore.view();
  const aircraftSceneFilter: AircraftSceneFilter = {
    filter: af,
    searchIds: searchSet,
    isolateMode: isoMode,
    isolatedId: isoId,
    isolatedType,
  };
  aircraftProjection.project(aircraftView, {
    width: W,
    height: H,
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
          matrix: globeMatrix,
          centerX: cx,
          centerY: cy,
          radius: globeR,
        },
    includes: (index) =>
      aircraftSceneIncludes(
        aircraftView,
        index,
        aircraftSceneFilter,
      ),
  });
  _hasSelectedProjection = false;
  const selectedPoint = pts.find(
    (candidate) => candidate.item.id === selId,
  );
  if (selectedPoint) {
    _hasSelectedProjection = true;
    _selectedProjectionX = selectedPoint.x;
    _selectedProjectionDepth = selectedPoint.z;
  }
  const selectedAircraftHandle = selId
    ? aircraftSceneStore.handleForId(selId)
    : null;
  const selectedAircraftProjection =
    selectedAircraftHandle === null
      ? null
      : aircraftProjection.projection(
          selectedAircraftHandle - 1,
        );
  if (selectedAircraftProjection) {
    _hasSelectedProjection = true;
    _selectedProjectionX = selectedAircraftProjection.x;
    _selectedProjectionDepth = selectedAircraftProjection.depth;
  }
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
  const selPassesFilters = (): boolean => {
    if (!selectedItem) return false;
    if (searchSet && !searchSet.has(selectedItem.id)) return false;
    if (isoMode === "solo" && selectedItem.id !== isoId) return false;
    if (isoMode === "focus" && isolatedType && selectedItem.type !== isolatedType) return false;
    if (selectedItem.type === "aircraft") {
      const handle = aircraftSceneStore.handleForId(selectedItem.id);
      return (
        handle !== null &&
        aircraftSceneIncludes(
          aircraftView,
          handle - 1,
          aircraftSceneFilter,
        )
      );
    }
    return layers[selectedItem.type] !== false;
  };
  const drawSelectedTrail = selPassesFilters();

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
    ctx, projFn, colorMap, accent: colors.accent, selId, t, zoomLevel, milColor, reconColor,
    showForecast: cyclonesShowForecast, showCone: cyclonesShowCone,
    showWindField: cyclonesShowWindField, showModels: cyclonesShowModels,
    hiddenModels: cyclonesHiddenModels, reducedMotion,
  };
  drawAircraftScene(aircraftView, aircraftProjection, {
    context: ctx,
    baseColor: colors.aircraft,
    militaryColor: milColor,
    reconColor,
    selectedId: selId,
    time: t,
    zoomLevel,
  });
  let fireLayerDrawn = false;
  let earthquakeLayerDrawn = false;
  for (const pt of pts) {
    if (
      !fireLayerDrawn &&
      _fires &&
      (
        pt.item.type === "events" ||
        pt.item.type === "weather" ||
        pt.item.type === "cyclones-forecast" ||
        pt.item.type === "cyclones"
      )
    ) {
      drawFireLayer(pointCtx, _fires);
      fireLayerDrawn = true;
    }
    if (
      !earthquakeLayerDrawn &&
      _earthquakes &&
      (
        pt.item.type === "weather" ||
        pt.item.type === "cyclones-forecast" ||
        pt.item.type === "cyclones"
      )
    ) {
      if (!fireLayerDrawn && _fires) {
        drawFireLayer(pointCtx, _fires);
        fireLayerDrawn = true;
      }
      drawEarthquakeLayer(pointCtx, _earthquakes);
      earthquakeLayerDrawn = true;
    }
    drawPoint(pointCtx, pt);
  }
  if (!fireLayerDrawn && _fires) drawFireLayer(pointCtx, _fires);
  if (!earthquakeLayerDrawn && _earthquakes) {
    drawEarthquakeLayer(pointCtx, _earthquakes);
  }
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

  updateSelectedSide();
  updateTrailTooltip();
  postCameraSummary(now);

  const hasRevealWork = _revealCount < fullData.length;
  const hasMotion = trailMap.size > 0;
  const hasVisualAnimation =
    !p.prefersReducedMotion &&
    (
      _hasAnimatedPoints ||
      _hasAnimatedEarthquakes ||
      _hasAnimatedFires ||
      p.selectedId !== null
    );
  if (
    (hasRevealWork || hasMotion || hasVisualAnimation || cameraActive) &&
    !_frameScheduled
  ) {
    _frameScheduled = true;
    requestAnimationFrame(renderFrame);
  }
}
