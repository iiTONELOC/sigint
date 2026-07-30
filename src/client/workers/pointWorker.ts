/// <reference lib="webworker" />
// Owns the transferred canvas and all Canvas2D drawing.
import { Domain } from "@shared/domain/identity";
import {
  MilFilter,
  squawkBucketFor,
} from "@shared/domain/aircraft";
import {
  MS_PER_SECOND,
} from "@shared/time";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
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
  RenderCursor,
  RenderFocusKind,
  RenderInputKind,
  RenderInputPhase,
  RenderInteractionKind,
  RenderMessageType,
  acceptRenderCommand,
  createRenderMessage,
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
  type RenderWorkerEventBody,
  type SelectedRenderItem,
  IsolateMode,
  PanelSide,
} from "./render/protocol";

import {
  RenderDataCommandType,
  parseRenderDataCommand,
  RenderDataProtocolState,
  type LegacyPointSourceId,
} from "./render/dataChannel";

import { orderPointsByLayer } from "./render/layerOrder";
import { drawMarkerLayerSequence } from "./render/layerSequence";
import type { DataType } from "@/features/base/dataPoints";
import type { AircraftData } from "@/features/tracking/aircraft/types";
import {
  AircraftLayer,
  type AircraftSceneFilter,
} from "./render/scene/aircraftLayer";
import {
  ShipLayer,
} from "./render/scene/shipLayer";
import { EventLayer } from "./render/scene/eventLayer";
import {
  EarthquakeLayer,
  type EarthquakeSceneFilter,
} from "./render/scene/earthquakeLayer";
import {
  FireLayer,
  type FireSceneFilter,
} from "./render/scene/fireLayer";
import {
  WeatherLayer,
} from "./render/scene/weatherLayer";
import {
  CycloneWarningLayer,
} from "./render/scene/cycloneWarningLayer";
import type {
  SceneAreaProjectionFrame,
} from "./render/scene/areaLayer";
import { RenderLayerCatalog } from "./render/scene/renderLayerCatalog";
import type {
  SceneVisibilitySettings,
} from "./render/scene/visibility";
import { MarkerVisuals } from "./render/primitives/markerVisuals";
import { pointTypeForSource } from "./data/sources/registry";
import {
  parseSceneDataCommand,
  SceneDataCommandType,
  SceneDataProtocolState,
} from "./render/sceneProtocol";
import {
  SceneHitKind,
} from "./render/scene/projectedLayer";
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
import {
  createGeoPoint,
  GeoLimit,
  type GeoPoint,
  type GeoRing,
} from "@shared/geo";
import { parseLandGeoJson } from "@shared/land";
import { getFlatMetrics, projFlat } from "@/lib/geo/render/flatMap";
import { drawGrid } from "@/lib/geo/render/grid";
import { drawFlatLandRing, drawProjectedLandRing } from "@/lib/geo/render/land";
import type { HorizonCircle, LandColors } from "@/lib/geo/render/types";

enum PointWorkerError {
  LandGeometryRequestFailed = "Land geometry request failed",
}

enum CanvasLineStyle {
  Round = "round",
}

enum SceneProjectionPolicy {
  CullMarginPixels = 24,
  HorizonInsetPixels = 0.5,
}

enum FlatLabelLayout {
  MinimumPixels = 8,
  ViewportScale = 0.015,
  BottomOffsetPixels = 13,
  SideOffsetPixels = 5,
  BaselineOffsetPixels = 3,
}

enum FlatCoordinateLabel {
  LongitudeStepDegrees = 60,
  LongitudeLimitDegrees = 120,
  LatitudeStepDivisor = 2,
}

// ── Interpolation ───────────────────────────────────────────────────

type TrailEntry = Readonly<{
  source: Domain.Aircraft | Domain.Ships;
  timestamp: number;
  speedMetersPerSecond: number;
  motion: GeographicMotion;
}>;

const markerVisuals = new MarkerVisuals();
let trailMap = new Map<string, TrailEntry>();

function interpolationSeconds(
  entry: TrailEntry,
): number | null {
  if (entry.speedMetersPerSecond <= 0) return null;
  const elapsedMilliseconds = Date.now() - entry.timestamp;
  const limit = entry.source === Domain.Ships
    ? RENDER_POLICY.shipInterpolationLimitMs
    : RENDER_POLICY.aircraftInterpolationLimitMs;
  if (
    elapsedMilliseconds < RENDER_POLICY.minimumInterpolationAgeMs ||
    elapsedMilliseconds > limit
  ) {
    return null;
  }
  return elapsedMilliseconds / MS_PER_SECOND;
}

function getInterp(id: string): { lat: number; lon: number } | null {
  const entry = trailMap.get(id);
  if (!entry) return null;
  const elapsedSeconds = interpolationSeconds(entry);
  if (elapsedSeconds === null) return null;
  const position = advanceGeographicMotion(entry.motion, elapsedSeconds);
  return { lat: position.latitude, lon: position.longitude };
}

// ── Theme detection ─────────────────────────────────────────────────

function isLightTheme(colors: { bg?: string }): boolean {
  return markerVisuals.isLight(colors.bg);
}

// ── Aircraft filter ─────────────────────────────────────────────────

type AircraftFilter = RenderAircraftFilter;

function matchesAltitudeBand(
  d: AircraftData,
  f: AircraftFilter,
): boolean {
  const onGround = d.onGround === true;
  return onGround ? f.showGround : f.showAirborne;
}

function matchesRole(d: AircraftData, f: AircraftFilter): boolean {
  switch (f.milFilter) {
    case MilFilter.Military:
      return d.military === true;
    case MilFilter.Civilian:
      return d.military !== true;
    case MilFilter.Recon:
      return d.recon === true;
    default:
      return true;
  }
}

function matchesSquawk(d: AircraftData, f: AircraftFilter): boolean {
  if (f.squawks.length === 0) return true;
  const bucket = squawkBucketFor(d.squawk);
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
      if (!response.ok) {
        throw new Error(PointWorkerError.LandGeometryRequestFailed);
      }
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

type TrailColors = Readonly<{
  accent: string;
  bright: string;
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
  colors: TrailColors,
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
  ctx.lineJoin = CanvasLineStyle.Round;
  ctx.lineCap = CanvasLineStyle.Round;
  strokeTrailPass(ctx, projected, 6, 0.05, 0.15, colors.accent); // glow pass
  strokeTrailPass(ctx, projected, 2.5, 0.3, 0.7, colors.accent); // main line

  const hitTargets: TrailHitTarget[] = [];
  ctx.fillStyle = colors.bright;
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
type RouteColors = Readonly<{
  cyclones: string;
  accent: string;
  bright: string;
}>;

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
  ctx.lineJoin = CanvasLineStyle.Round;
  ctx.lineCap = CanvasLineStyle.Round;
  ctx.strokeStyle = colors.cyclones || colors.accent;
  // Ahead: thin and dashed.
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([6, 4]);
  strokePts(ahead);
  // Flown: thick and solid.
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 2.75;
  strokePts(flown);

  // Waypoint markers.
  ctx.fillStyle = colors.bright;
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
let _dataBySource:
  | Partial<Record<LegacyPointSourceId, RenderPoint[]>>
  | null = null;
let _presentation: RenderPresentationPayload | null = null;
let _viewport: RenderViewportPayload | null = null;
const _camera = createWorkerCameraState();
const _cameraTarget = createWorkerCameraTarget();
const _pointer = createWorkerPointerState();
let _lastFrameAt = performance.now();
let _hasAnimatedPoints = false;
let _hitGrid = new Map<string, ProjPoint[]>();
let _trailHitTargets: TrailHitTarget[] = [];
let _activeTrailPoint: WorkerTrailPoint | null = null;
let _lastClickTime = 0;
let _lastClickId: string | null = null;
let _lastClickPosition: CameraPosition | null = null;
type CursorInteraction = Extract<
  RenderInteractionPayload,
  { kind: RenderInteractionKind.Cursor }
>;

let _lastCursor: CursorInteraction = {
  kind: RenderInteractionKind.Cursor,
  cursor: RenderCursor.Default,
};
let _lastSelectedSide: PanelSide = PanelSide.Right;
let _lastCameraSummary: RenderCamera | null = null;
let _lastCameraSummaryAt = 0;
let _frameScheduled = false;

let _hasSelectedProjection = false;
let _selectedProjectionX = 0;
let _selectedProjectionDepth = -1;

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

const renderLayerCatalog = new RenderLayerCatalog();
const aircraftLayer = new AircraftLayer();
const shipLayer = new ShipLayer();
const eventLayer = new EventLayer(markerVisuals);
const earthquakeLayer = new EarthquakeLayer(markerVisuals);
const fireLayer = new FireLayer(markerVisuals);
const weatherLayer = new WeatherLayer(markerVisuals);
const cycloneWarningLayer = new CycloneWarningLayer();
renderLayerCatalog.register(aircraftLayer);
renderLayerCatalog.register(shipLayer);
renderLayerCatalog.register(fireLayer);
renderLayerCatalog.register(eventLayer);
renderLayerCatalog.register(earthquakeLayer);
renderLayerCatalog.register(cycloneWarningLayer);
renderLayerCatalog.register(weatherLayer);

function bindDataPort(port: MessagePort, sessionId: string): void {
  dataPort?.close();
  dataPort = port;
  const state = new RenderDataProtocolState(sessionId);
  const sceneState = new SceneDataProtocolState(sessionId);
  port.onmessage = (event: MessageEvent<unknown>) => {
    const command = parseRenderDataCommand(event.data);
    if (command && state.accept(command)) {
      if (command.type === RenderDataCommandType.Bind) {
        globalThis.postMessage(
          createRenderMessage(
            { type: RenderMessageType.DataChannelReady },
            sessionId,
            protocolState.sequence,
          ),
        );
        return;
      }
      applyRenderDataCommand(command);
      scheduleRender();
      return;
    }

    const sceneCommand = parseSceneDataCommand(event.data);
    if (
      !sceneCommand ||
      !sceneState.accept(sceneCommand) ||
      sceneCommand.type === SceneDataCommandType.Bind
    ) {
      return;
    }
    if (!renderLayerCatalog.apply(sceneCommand)) return;
    scheduleRender();
  };
  port.start();
}

function postWorkerEvent(body: RenderWorkerEventBody): void {
  const sessionId = protocolState.sessionId;
  if (!sessionId) return;
  globalThis.postMessage(
    createRenderMessage(body, sessionId, protocolState.sequence),
  );
}

function postInteraction(payload: RenderInteractionPayload): void {
  postWorkerEvent({
    type: RenderMessageType.Interaction,
    payload,
  });
}

function postCursor(cursor: CursorInteraction): void {
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
  _lastCameraSummary = snapshot;
  _lastCameraSummaryAt = now;
  postWorkerEvent({
    type: RenderMessageType.Camera,
    payload: snapshot,
  });
}


function scheduleRender(): void {
  const hasState = _presentation !== null && _viewport !== null;
  if (_frameScheduled || !hasState) return;
  _frameScheduled = true;
  requestAnimationFrame(renderFrame);
}

/**
 * Only the selected track is ever dead-reckoned, so its motion rides the
 * presentation command. This used to be a per-poll broadcast of every
 * aircraft and ship, packed on the main thread and almost entirely unread.
 */
function setSelectedMotion(item: SelectedRenderItem | null): void {
  const motion = item?.motion;
  if (
    !item ||
    !motion ||
    (item.type !== Domain.Aircraft && item.type !== Domain.Ships)
  ) {
    if (trailMap.size > 0) trailMap = new Map();
    return;
  }
  trailMap = new Map([
    [
      item.id,
      {
        source: item.type,
        timestamp: motion.ts,
        speedMetersPerSecond: motion.speedMps,
        motion: createGeographicMotion(
          motion.lat,
          motion.lon,
          motion.headingDeg,
          motion.speedMps,
        ),
      },
    ],
  ]);
}
function pointHasTimeAnimation(item: RenderPoint): boolean {
  return item.type === Domain.Cyclones;
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

type RenderDataCommand = NonNullable<
  ReturnType<typeof parseRenderDataCommand>
>;

/** Legacy cyclone updates, past the bind handshake. */
function applyRenderDataCommand(command: RenderDataCommand): void {
  if (command.type !== RenderDataCommandType.PointsRebase) return;

  _dataBySource ??= {};
  _dataBySource[command.source] = [...command.points];
  rebuildGenericData();
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

type PointerInput = Extract<
  RenderInputPayload,
  { kind: RenderInputKind.Pointer }
>;
type PinchInput = Extract<
  RenderInputPayload,
  { kind: RenderInputKind.Pinch }
>;

function handlePointerInput(
  payload: PointerInput,
  surface: InputSurface,
): void {
  const { viewport, flat } = surface;
  switch (payload.phase) {
    case RenderInputPhase.Hover:
      handlePointerHover(payload.x, payload.y);
      return;
    case RenderInputPhase.Start:
      beginCameraPointer(_camera, _pointer, viewport, flat, payload.x, payload.y);
      postCursor({
        kind: RenderInteractionKind.Cursor,
        cursor: _pointer.interactive
          ? RenderCursor.Grabbing
          : RenderCursor.Default,
      });
      break;
    case RenderInputPhase.Move:
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
    case RenderInputPhase.End: {
      const click = endCameraPointer(_pointer);
      if (click) handlePointerClick(click);
      postCursor({
        kind: RenderInteractionKind.Cursor,
        cursor: RenderCursor.Default,
      });
      break;
    }
    default:
      cancelCameraPointer(_pointer);
      postCursor({
        kind: RenderInteractionKind.Cursor,
        cursor: RenderCursor.Default,
      });
  }
  scheduleRender();
}

function handlePinchInput(payload: PinchInput, surface: InputSurface): void {
  if (payload.phase === RenderInputPhase.Start) {
    beginCameraPinch(_pointer, payload.distance);
  } else if (payload.phase === RenderInputPhase.Move) {
    moveCameraPinch(
      _camera,
      _cameraTarget,
      _pointer,
      surface.viewport,
      surface.flat,
      payload,
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
    case RenderInputKind.Pointer:
      handlePointerInput(payload, surface);
      return;
    case RenderInputKind.Pinch:
      handlePinchInput(payload, surface);
      return;
    case RenderInputKind.Wheel:
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

function handleInit(
  msg: Extract<RenderWorkerCommand, { type: RenderMessageType.Init }>,
): void {
  canvas = msg.canvas;
  ctx = canvas.getContext("2d");
  if (msg.dataPort) bindDataPort(msg.dataPort, msg.sessionId);
  globalThis.postMessage(
    createRenderMessage(
      { type: RenderMessageType.Ready },
      msg.sessionId,
      msg.sequence,
    ),
  );
  if (landRings.length === 0) fetchLandData();
}

function handleFocus(
  msg: Extract<
    RenderWorkerCommand,
    { type: RenderMessageType.Focus }
  >,
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

function handleViewport(payload: RenderViewportPayload): void {
  _viewport = payload;
}

function handlePresentation(payload: RenderPresentationPayload): void {
  _presentation = payload;
}

function dispatchRenderCommand(msg: RenderWorkerCommand): void {
  switch (msg.type) {
    case RenderMessageType.Init:
      handleInit(msg);
      return;
    case RenderMessageType.Colors:
      _colors = msg.payload;
      break;
    case RenderMessageType.Viewport:
      handleViewport(msg.payload);
      break;
    case RenderMessageType.Presentation:
      handlePresentation(msg.payload);
      break;
    case RenderMessageType.Focus:
      handleFocus(msg);
      return;
    case RenderMessageType.Input:
      handleCameraInput(msg.payload);
      return;
    case RenderMessageType.Dispose:
      handleDispose();
      return;
    default:
      return;
  }
  scheduleRender();
}

// ── Render everything ───────────────────────────────────────────────


// ── Per-type point drawing (extracted from the render loop) ─────────

type ProjPoint = { x: number; y: number; z: number; item: RenderPoint };

type PointProjector = (item: RenderPoint) => Projected;

const unitVectorByPoint = new WeakMap<RenderPoint, UnitVector>();

function unitVectorForPoint(item: RenderPoint): UnitVector {
  const cached = unitVectorByPoint.get(item);
  if (cached) return cached;
  const unit = geographicToUnitVector(recordLatitude(item), recordLongitude(item));
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
  showForecast: boolean;
};

/** Does one item survive the search / isolation / layer filters? */
function pointPassesFilters(item: RenderPoint, c: FilterCfg): boolean {
  if (c.searchSet && !c.searchSet.has(item.id)) return false;
  if (c.isoMode === IsolateMode.Solo && item.id !== c.isoId) return false;
  if (c.isoMode === IsolateMode.Focus && c.isolatedType && item.type !== c.isolatedType) return false;
  if (item.type === Domain.Aircraft) return matchesAF(item.data, c.af);
  if (item.type === Domain.CyclonesForecast) return c.layers.cyclones !== false && c.showForecast !== false;
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
  Readonly<{
    distance: number;
    kind: SceneHitKind;
    pointType: DataType;
  }>;

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
      kind: SceneHitKind.Point,
      pointType: point.item.type,
    };
    distance = candidateDistance;
  }
  return closest;
}

function nearestScenePoint(
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  const result = renderLayerCatalog.nearest(
    SceneHitKind.Point,
    x,
    y,
    radius,
    CAMERA_POLICY.maximumHitCandidates,
  );
  if (!result) return null;
  return {
    id: result.hit.entityId,
    latitude: result.hit.latitude,
    longitude: result.hit.longitude,
    distance: result.hit.distance,
    kind: result.hit.kind,
    pointType: pointTypeForSource(result.source),
  };
}

function areaAt(x: number, y: number): PointHit | null {
  const result = renderLayerCatalog.nearest(
    SceneHitKind.Area,
    x,
    y,
    CAMERA_POLICY.pointHitRadiusPx,
    CAMERA_POLICY.maximumHitCandidates,
  );
  if (!result) return null;
  return {
    id: result.hit.entityId,
    latitude: result.hit.latitude,
    longitude: result.hit.longitude,
    distance: result.hit.distance,
    kind: result.hit.kind,
    pointType: pointTypeForSource(result.source),
  };
}

function nearestPoint(
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  const generic = nearestGenericPoint(x, y, radius);
  const scene = nearestScenePoint(x, y, radius);
  return scene && (!generic || scene.distance < generic.distance)
    ? scene
    : generic;
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

function screenGeoPoint(
  x: number,
  y: number,
): GeoPoint | null {
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
    const coordinate = screenToLatLonFlat(
      x,
      y,
      metrics.cx,
      metrics.cy,
      metrics.mW,
      metrics.mH,
    );
    return coordinate
      ? createGeoPoint(coordinate.lon, coordinate.lat)
      : null;
  }
  const radius =
    Math.min(_viewport.width, _viewport.height) *
    CAMERA_POLICY.globeRadiusRatio *
    camera.zoomGlobe;
  const coordinate = screenToLatLonGlobe(
    x,
    y,
    _viewport.width / 2,
    _viewport.height / 2,
    radius,
    camera.rotY,
    camera.rotX,
  );
  return coordinate
    ? createGeoPoint(coordinate.lon, coordinate.lat)
    : null;
}

function clearTrailTooltip(): void {
  if (!_activeTrailPoint) return;
  _activeTrailPoint = null;
  postInteraction({
    kind: RenderInteractionKind.TrailTooltip,
    point: null,
    x: 0,
    y: 0,
    visible: false,
  });
}

function positionForItem(item: RenderPoint): CameraPosition {
  const interpolated =
    item.type === Domain.Aircraft || item.type === Domain.Ships
      ? getInterp(item.id)
      : null;
  return {
    id: item.id,
    latitude: interpolated?.lat ?? recordLatitude(item),
    longitude: interpolated?.lon ?? recordLongitude(item),
  };
}

function resetClickMemory(): void {
  _lastClickTime = 0;
  _lastClickId = null;
  _lastClickPosition = null;
}

function handlePointerClick(click: CameraClick): void {
  if (!click.interactive) {
    postInteraction({
      kind: RenderInteractionKind.RawCanvasClick,
    });
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
        RenderFocusKind.Double,
      );
    }
    resetClickMemory();
    return;
  }

  if (point && !trailTarget) {
    clearTrailTooltip();
    postInteraction({
      kind: RenderInteractionKind.Selection,
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
      kind: RenderInteractionKind.TrailTooltip,
      point: trailTarget.point,
      x: trailTarget.x,
      y: trailTarget.y,
      visible: true,
    });
    resetClickMemory();
    return;
  }

  clearTrailTooltip();
  const area = areaAt(click.x, click.y);
  if (area) {
    postInteraction({
      kind: RenderInteractionKind.Selection,
      id: area.id,
      pointType: area.pointType,
    });
  } else if (!selectedRouteContains(click.x, click.y)) {
    postInteraction({
      kind: RenderInteractionKind.Selection,
      id: null,
      pointType: null,
    });
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
    postCursor({
      kind: RenderInteractionKind.Cursor,
      cursor: RenderCursor.Default,
    });
    return;
  }
  const hasTrail = nearestTrailTarget(x, y) !== null;
  const hasPoint =
    nearestPoint(x, y, CAMERA_POLICY.hoverHitRadiusPx) !== null;
  const hasArea = areaAt(x, y) !== null;
  postCursor({
    kind: RenderInteractionKind.Cursor,
    cursor:
      hasTrail || hasPoint || hasArea
        ? RenderCursor.Pointer
        : RenderCursor.Grab,
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
    next === PanelSide.Right &&
    ratio > CAMERA_POLICY.selectedSideRightRatio
  ) {
    next = PanelSide.Left;
  } else if (
    next === PanelSide.Left &&
    ratio < CAMERA_POLICY.selectedSideLeftRatio
  ) {
    next = PanelSide.Right;
  }
  if (next === _lastSelectedSide) return;
  _lastSelectedSide = next;
  postInteraction({
    kind: RenderInteractionKind.SelectedSide,
    side: next,
  });
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
    kind: RenderInteractionKind.TrailTooltip,
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

/** Draw one projected point by its type. Each branch returns after drawing. */
type PointDraw = Readonly<{
  x: number;
  y: number;
  baseColor: string;
  depthAlpha: number;
  isSel: boolean;
}>;

/**
 * The legacy point path now carries only the cyclone composite.
 */
function drawPoint(pc: PointDrawCtx, pt: ProjPoint): void {
  const { ctx, projFn, colorMap, accent, selId, t } = pc;
  const { x, y, z, item } = pt;
  const d: PointDraw = {
    x,
    y,
    baseColor: colorMap[item.type] || accent,
    depthAlpha: 0.4 + z * 0.6,
    isSel: item.id === selId,
  };

  switch (item.type) {
    case Domain.Cyclones:
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
    case Domain.CyclonesForecast:
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
function sceneProjectionBase(
  geometry: SceneGeometry,
  project: ProjFn,
): SceneAreaProjectionFrame {
  const { fm } = geometry;
  return {
    width: geometry.width,
    height: geometry.height,
    hitCellSize: CAMERA_POLICY.hitCellSizePx,
    cullMargin: SceneProjectionPolicy.CullMarginPixels,
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
    areaProjection: {
      project,
      horizon: fm
        ? null
        : {
            gcx: geometry.centerX,
            gcy: geometry.centerY,
            gr:
              geometry.globeRadius -
              SceneProjectionPolicy.HorizonInsetPixels,
          },
    },
    screenPoint: screenGeoPoint,
  };
}

function drawPointLayers(
  pointCtx: PointDrawCtx,
  pts: readonly ProjPoint[],
  drawFireLayer: () => void,
  drawEventLayer: () => void,
  drawEarthquakeLayer: () => void,
  drawWeatherLayer: () => void,
): void {
  drawMarkerLayerSequence({
    fire: drawFireLayer,
    event: drawEventLayer,
    earthquake: drawEarthquakeLayer,
    weather: drawWeatherLayer,
    legacy: () => {
      for (const point of pts) drawPoint(pointCtx, point);
    },
  });
}

type AreaOverlayOptions = Readonly<{
  context: Ctx;
  selectedId: string | null;
  time: number;
  warningColor: string;
  watchColor: string;
}>;

/** Tropical watch/warning and NWS alert polygons, under every marker. */
function drawAreaOverlays(options: AreaOverlayOptions): void {
  cycloneWarningLayer.drawAreas({
    context: options.context,
    selectedId: options.selectedId,
    time: options.time,
    warningColor: options.warningColor,
    watchColor: options.watchColor,
  });
  weatherLayer.drawAreas({
    context: options.context,
    selectedId: options.selectedId,
    time: options.time,
  });
}

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
    FlatLabelLayout.MinimumPixels,
    Math.min(viewport.width, viewport.height) *
      FlatLabelLayout.ViewportScale,
  );
  ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
  ctx.textAlign = "center";
  for (
    let lon = -FlatCoordinateLabel.LongitudeLimitDegrees;
    lon <= FlatCoordinateLabel.LongitudeLimitDegrees;
    lon += FlatCoordinateLabel.LongitudeStepDegrees
  ) {
    ctx.fillText(
      `${Math.abs(lon)}°${lon >= 0 ? "E" : "W"}`,
      fm.cx +
        (lon / GeoLimit.MaxLongitude) * (fm.mW / 2),
      fm.my + fm.mH + FlatLabelLayout.BottomOffsetPixels,
    );
  }
  ctx.textAlign = "right";
  for (
    let lat = -FlatCoordinateLabel.LongitudeStepDegrees;
    lat <= FlatCoordinateLabel.LongitudeStepDegrees;
    lat +=
      FlatCoordinateLabel.LongitudeStepDegrees /
      FlatCoordinateLabel.LatitudeStepDivisor
  ) {
    ctx.fillText(
      `${Math.abs(lat)}°${lat >= 0 ? "N" : "S"}`,
      fm.mx - FlatLabelLayout.SideOffsetPixels,
      fm.cy -
        (lat / GeoLimit.MaxLatitude) * (fm.mH / 2) +
        FlatLabelLayout.BaselineOffsetPixels,
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

function frameTheme(colors: RenderWorkerColors): FrameTheme {
  const light = isLightTheme(colors);
  return {
    light,
    landAlpha: light ? 0.9 : 0.7,
    gridAlpha: light ? 0.18 : 0.11,
    glowAlpha: light ? "08" : "0d",
    milColor: colors.military,
    reconColor: colors.recon,
    colorMap: {
      ships: colors.ships,
      aircraft: colors.aircraft,
      events: colors.events,
      quakes: colors.quakes,
      fires: colors.fires,
      weather: colors.weather,
      cyclones: colors.cyclones,
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
  aircraftFilter: AircraftSceneFilter;
}>;

/** The trail and route only draw when the selection survives the filters. */
function selectionPassesFilters(v: SelectionVisibility): boolean {
  const item = v.selectedItem;
  if (!item) return false;
  if (v.searchSet && !v.searchSet.has(item.id)) return false;
  if (v.isoMode === IsolateMode.Solo && item.id !== v.isoId) return false;
  if (
    v.isoMode === IsolateMode.Focus &&
    v.isolatedType &&
    item.type !== v.isolatedType
  ) {
    return false;
  }
  if (item.type !== Domain.Aircraft) return v.layers[item.type] !== false;

  return aircraftLayer.includesEntity(item.id, v.aircraftFilter);
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
        projFlat(recordLatitude(item), recordLongitude(item), fm.cx, fm.cy, fm.mW, fm.mH),
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
  project: ProjFn;
  geometry: SceneGeometry;
  presentation: RenderPresentationPayload;
  showForecast: boolean;
}>;

type ProjectedFrame = Readonly<{
  pts: ProjPoint[];
  searchSet: Set<string> | null;
  isolatedType: string | null;
  aircraftSceneFilter: AircraftSceneFilter;
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
    showForecast: options.showForecast,
  };
  const pts = projectAndFilter(options.data, options.projectPoint, filterCfg);
  rebuildHitGrid(pts);

  const base = sceneProjectionBase(
    options.geometry,
    options.project,
  );
  const sceneVisibility: SceneVisibilitySettings = {
    searchIds: searchSet,
    isolateMode: isoMode,
    isolatedId: isoId,
    isolatedType,
  };
  const aircraftSceneFilter: AircraftSceneFilter = {
    filter: p.aircraftFilter,
    ...sceneVisibility,
  };
  aircraftLayer.project(base, aircraftSceneFilter);

  shipLayer.project(base, {
    enabled: p.layers.ships !== false,
    ...sceneVisibility,
  });

  const fireSceneFilter: FireSceneFilter = {
    enabled: p.layers[Domain.Fires] !== false,
    minimumConfidence: p.fireMinConfidence,
    ...sceneVisibility,
    searchIds: null,
  };
  fireLayer.project(base, fireSceneFilter);

  eventLayer.project(base, {
    enabled: p.layers[Domain.Events] !== false,
    ...sceneVisibility,
  });

  const earthquakeSceneFilter: EarthquakeSceneFilter = {
    enabled: p.layers[Domain.Quakes] !== false,
    minimumMagnitude: p.earthquakeMinMagnitude,
    ...sceneVisibility,
    searchIds: null,
  };
  earthquakeLayer.project(base, earthquakeSceneFilter);

  cycloneWarningLayer.project(base, {
    enabled: p.cyclonesShowWarnings !== false,
    ...sceneVisibility,
  });

  weatherLayer.project(base, {
    enabled: p.layers[Domain.Weather] !== false,
    ...sceneVisibility,
  });

  return {
    pts,
    searchSet,
    isolatedType,
    aircraftSceneFilter,
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

  const sceneProjection =
    renderLayerCatalog.selectionAnchor(selectedId);
  if (sceneProjection) {
    _hasSelectedProjection = true;
    _selectedProjectionX = sceneProjection.x;
    _selectedProjectionDepth = sceneProjection.depth;
  }
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
      renderLayerCatalog.hasTimeAnimation(reducedMotion) ||
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
    {
      viewport: { width: W, height: H },
      flat: isFlat,
      autoRotate: p.autoRotate,
      rotationSpeed: p.rotationSpeed,
      selectedPosition: selectedCameraPosition(),
      deltaMilliseconds: now - _lastFrameAt,
    },
  );
  _lastFrameAt = now;
  const cam = cameraSnapshot(_camera);
  const wallTime = Date.now();
  const t = wallTime * 0.003;
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

  // ── Project + filter points ───────────────────────────────────
  const projected = projectFrame({
    data,
    projectPoint,
    project: projFn,
    geometry,
    presentation: p,
    showForecast: cyclones.showForecast,
  });
  const {
    pts,
    searchSet,
    isolatedType,
    aircraftSceneFilter,
  } = projected;
  updateSelectedProjection(pts, selId);

  drawAreaOverlays({
    context: ctx,
    selectedId: selId ?? null,
    time: t,
    warningColor: colors.cycWarning,
    watchColor: colors.cycWatch,
  });

  // ── Draw trail (only if the selected item passes current filters) ──
  const drawSelectedTrail = selectionPassesFilters({
    selectedItem,
    searchSet,
    isoMode,
    isoId,
    isolatedType,
    layers,
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
  aircraftLayer.draw({
    context: ctx,
    baseColor: colors.aircraft,
    militaryColor: milColor,
    reconColor,
    selectedId: selId,
    time: t,
    zoomLevel,
  });
  shipLayer.draw({
    context: ctx,
    color: colorMap.ships ?? colors.accent,
    selectedId: selId,
    time: t,
    zoomLevel,
  });
  drawPointLayers(
    pointCtx,
    pts,
    () => {
      fireLayer.draw({
        context: ctx,
        color: colorMap.fires ?? colors.accent,
        selectedId: selId,
        time: t,
        now: wallTime,
        zoomLevel,
      });
    },
    () => {
      eventLayer.draw({
        context: ctx,
        color: colorMap.events ?? colors.accent,
        selectedId: selId,
        time: t,
        now: wallTime,
        zoomLevel,
      });
    },
    () => {
      earthquakeLayer.draw({
        context: ctx,
        color: colorMap.quakes ?? colors.accent,
        selectedId: selId,
        time: t,
        now: wallTime,
        zoomLevel,
      });
    },
    () => {
      weatherLayer.draw({
        context: ctx,
        color: colorMap.weather ?? colors.accent,
        selectedId: selId,
        time: t,
        zoomLevel,
      });
    },
  );
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
