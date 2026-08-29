/// <reference lib="webworker" />
// Owns the transferred canvas and all Canvas2D drawing.
import { CAMERA_POLICY } from "./render/policy";
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
  createCameraProjection,
  endCameraPinch,
  endCameraPointer,
  focusCamera,
  lockCamera,
  moveCameraPinch,
  moveCameraPointer,
  stepCamera,
  type CameraClick,
  type CameraPosition,
  type CameraViewport,
} from "./render/camera";
import {
  RenderCursor,
  RenderFocusKind,
  RenderGlobeCommandKind,
  RenderInputKind,
  RenderInputPhase,
  RenderInteractionKind,
  RenderMessageType,
  RenderProjectionMode,
  acceptRenderCommand,
  createRenderMessage,
  type RenderCamera,
  type RenderGlobeStateSnapshot,
  type RenderInputPayload,
  type RenderInteractionPayload,
  type RenderSelectionIdentity,
  type RenderViewportPayload,
  type RenderProtocolState,
  type RenderWorkerCommand,
  type RenderWorkerEventBody,
  type SelectedIsolateMode,
} from "./render/protocol";
import { PanelSide } from "@/layout-mode/model/layoutMode";
import type { RenderWorkerColors } from "@shared/domain/theme";
import { RenderSelectionController } from "./render/selectionController";
import {
  RenderSearchController,
  type RenderSearchSelectionState,
} from "./render/searchController";
import { RenderFocusResolver } from "./render/focusResolver";
import { RenderGlobeStateController } from "./render/globeStateController";
import { RenderLayerCatalog } from "./render/scene/renderLayerCatalog";
import { MarkerVisuals } from "./render/primitives/markerVisuals";
import {
  parseSceneDataCommand,
  SceneDataCommandType,
  SessionSequenceState,
} from "./render/sceneProtocol";
import { SceneHitKind } from "./render/scene/projectedLayer";
import type { ProjFn } from "@/lib/geo/render/types";
import type { TrailPoint } from "@/lib/geo/trails/trailStore";
import { SceneInterestPublisher } from "@/workers/render/sceneInterestPublisher";
import type { RenderSourceId } from "@shared/source";
import {
  SelectionOverlayStore,
  type SelectionOverlayPosition,
} from "@/workers/render/selectionOverlayStore";
import { selectionIsVisible } from "@/workers/render/selectionVisibility";

const markerVisuals = new MarkerVisuals();

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let _viewport: RenderViewportPayload | null = null;

function toCameraViewport(
  viewport: RenderViewportPayload,
): CameraViewport {
  return {
    width: viewport.width,
    height: viewport.height,
    isMobile: viewport.isMobile,
  };
}
const _camera = createWorkerCameraState();
const _cameraTarget = createWorkerCameraTarget();
const _pointer = createWorkerPointerState();
let _lastFrameAt = performance.now();
let _activeTrailPoint: TrailPoint | null = null;
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

const protocolState: RenderProtocolState = {
  sessionId: null,
  sequence: 0,
};

let dataPort: MessagePort | null = null;

const renderLayerCatalog = new RenderLayerCatalog(markerVisuals);
const focusResolver = new RenderFocusResolver(renderLayerCatalog);
const globeStateController = new RenderGlobeStateController();
const selectionController = new RenderSelectionController();
const searchController = new RenderSearchController();
const selectionOverlayStore = new SelectionOverlayStore();
const sceneInterestPublisher = new SceneInterestPublisher();

function bindDataPort(port: MessagePort, sessionId: string): void {
  dataPort?.close();
  dataPort = port;
  const sceneState = new SessionSequenceState(sessionId);
  sceneInterestPublisher.connect(port, sessionId);
  port.onmessage = (event: MessageEvent<unknown>) => {
    const sceneCommand = parseSceneDataCommand(event.data);
    if (!sceneCommand || !sceneState.accept(sceneCommand)) return;
    if (sceneCommand.type === SceneDataCommandType.Bind) {
      sceneInterestPublisher.publishSelection(
        selectionController.snapshot(),
      );
      const search = searchController.snapshot();
      if (search) sceneInterestPublisher.publishSearch(search);
      globalThis.postMessage(
        createRenderMessage(
          { type: RenderMessageType.DataChannelReady },
          sessionId,
          protocolState.sequence,
        ),
      );
      return;
    }
    if (
      sceneCommand.type === SceneDataCommandType.SelectionOverlay
    ) {
      if (
        selectionOverlayStore.apply(
          sceneCommand,
          selectionController.snapshot(),
        )
      ) {
        scheduleRender();
      }
      return;
    }
    if (!renderLayerCatalog.apply(sceneCommand)) return;
    if (sceneCommand.type === SceneDataCommandType.SourceSearch) {
      reconcileSearchSelection(
        sceneCommand.source,
        sceneCommand.searchRevision,
      );
    }
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

function selectionIdentity(): RenderSelectionIdentity | null {
  return selectionController.snapshot().identity;
}

function usesFlatProjection(): boolean {
  return (
    globeStateController.snapshot().projection ===
    RenderProjectionMode.Flat
  );
}

function updateSelection(
  identity: RenderSelectionIdentity | null,
): boolean {
  if (!selectionController.set(identity)) return false;
  if (identity === null) updateIsolation(null);
  selectionOverlayStore.clear();
  sceneInterestPublisher.publishSelection(
    selectionController.snapshot(),
  );
  scheduleRender();
  return true;
}

function postSelectionInteraction(): void {
  postInteraction({
    kind: RenderInteractionKind.Selection,
    selection: selectionController.snapshot(),
  });
}

function commitCanvasSelection(
  identity: RenderSelectionIdentity | null,
): void {
  if (!updateSelection(identity)) return;
  postSelectionInteraction();
}

function restoreSearchSelection(
  state: RenderSearchSelectionState,
): void {
  if (!updateSelection(state.identity)) return;
  updateIsolation(state.isolateMode);
  postSelectionInteraction();
}

function reconcileSearchSelection(
  source: RenderSourceId,
  searchRevision: number,
): void {
  const identity = selectionIdentity();
  const hidden = searchController.hideSelection(
    source,
    searchRevision,
    identity
      ? renderLayerCatalog.searchIncludesEntity(
          source,
          identity.entityId,
        )
      : false,
    identity,
    globeStateController.snapshot().isolateMode,
  );
  if (!hidden || !updateSelection(null)) return;
  postSelectionInteraction();
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
  if (_frameScheduled || !_viewport) return;
  _frameScheduled = true;
  requestAnimationFrame(renderFrame);
}

function selectedCameraPosition(
  time: number,
): SelectionOverlayPosition | null {
  const identity = selectionIdentity();
  if (!identity) return null;
  const target = renderLayerCatalog.selectionTarget(
    identity.source,
    identity.interactionId,
    time,
  );
  if (!target) return null;
  return {
    id: identity.interactionId,
    interpolated: target.interpolated,
    latitude: target.latitude,
    longitude: target.longitude,
  };
}

type InputSurface = Readonly<{
  viewport: CameraViewport;
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
  if (!_viewport) return;
  const surface: InputSurface = {
    viewport: toCameraViewport(_viewport),
    flat: usesFlatProjection(),
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
}

function handleFocus(
  msg: Extract<
    RenderWorkerCommand,
    { type: RenderMessageType.Focus }
  >,
): void {
  if (!_viewport) return;
  const time = Date.now();
  const position = focusResolver.resolve(
    msg.payload,
    selectionIdentity(),
    selectedCameraPosition(time),
    time,
  );
  if (!position) return;
  focusCamera(
    _camera,
    _cameraTarget,
    position,
    toCameraViewport(_viewport),
    usesFlatProjection(),
    msg.payload.kind,
  );
  scheduleRender();
}

function handleDispose(): void {
  dataPort?.close();
  dataPort = null;
  sceneInterestPublisher.disconnect();
  selectionOverlayStore.clear();
  canvas = null;
  ctx = null;
  _viewport = null;
  _frameScheduled = false;
}

function handleGlobeCommand(payload: unknown): void {
  const snapshot = globeStateController.apply(payload);
  if (!snapshot) return;
  postWorkerEvent({
    type: RenderMessageType.GlobeState,
    payload: snapshot,
  });
  scheduleRender();
}

function updateIsolation(mode: SelectedIsolateMode): void {
  handleGlobeCommand({
    kind: RenderGlobeCommandKind.SetIsolation,
    mode,
  });
}

function handleSearch(text: string | null): void {
  const update = searchController.update(text);
  if (!update) return;
  sceneInterestPublisher.publishSearch(update.search);
  if (update.restore) restoreSearchSelection(update.restore);
}

function dispatchRenderCommand(msg: RenderWorkerCommand): void {
  switch (msg.type) {
    case RenderMessageType.Init:
      handleInit(msg);
      return;
    case RenderMessageType.Land:
      renderLayerCatalog.setLand(msg.payload);
      scheduleRender();
      return;
    case RenderMessageType.Viewport:
      _viewport = msg.payload;
      break;
    case RenderMessageType.GlobeCommand:
      handleGlobeCommand(msg.payload);
      return;
    case RenderMessageType.Selection:
      updateSelection(msg.payload);
      break;
    case RenderMessageType.Search:
      handleSearch(msg.payload);
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

type PointHit = Readonly<{
  identity: RenderSelectionIdentity;
  latitude: number;
  longitude: number;
}>;

function sceneHit(
  kind: SceneHitKind,
  x: number,
  y: number,
  radius: number,
): PointHit | null {
  const result = renderLayerCatalog.nearest(
    kind,
    x,
    y,
    radius,
    CAMERA_POLICY.maximumHitCandidates,
  );
  if (!result) return null;
  return {
    identity: result.identity,
    latitude: result.hit.latitude,
    longitude: result.hit.longitude,
  };
}

function currentProjection(): ProjFn | null {
  if (!_viewport) return null;
  return createCameraProjection(
    cameraSnapshot(_camera),
    _viewport,
    usesFlatProjection(),
  ).project;
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

  const trailTarget = selectionOverlayStore.nearestTrail(
    click.x,
    click.y,
  );
  const point = sceneHit(
    SceneHitKind.Point,
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
    if (target && _viewport) {
      focusCamera(
        _camera,
        _cameraTarget,
        target,
        toCameraViewport(_viewport),
        usesFlatProjection(),
        RenderFocusKind.Double,
      );
    }
    resetClickMemory();
    return;
  }

  if (point && !trailTarget) {
    clearTrailTooltip();
    commitCanvasSelection(point.identity);
    lockCamera(
      _camera,
      _cameraTarget,
      point.identity.interactionId,
      usesFlatProjection(),
    );
    _lastClickTime = now;
    _lastClickId = point.identity.interactionId;
    _lastClickPosition = {
      id: point.identity.interactionId,
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
  const area = sceneHit(
    SceneHitKind.Area,
    click.x,
    click.y,
    CAMERA_POLICY.pointHitRadiusPx,
  );
  if (area) {
    commitCanvasSelection(area.identity);
  } else if (
    !selectionOverlayStore.routeContains(
      click.x,
      click.y,
      currentProjection(),
    )
  ) {
    commitCanvasSelection(null);
  }
  resetClickMemory();
}

function handlePointerHover(x: number, y: number): void {
  if (!_viewport || _pointer.active) return;
  const viewport = toCameraViewport(_viewport);
  if (
    !cameraContainsPoint(
      _camera,
      viewport,
      usesFlatProjection(),
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
  const hasTrail = selectionOverlayStore.nearestTrail(x, y) !== null;
  const hasPoint =
    sceneHit(SceneHitKind.Point, x, y, CAMERA_POLICY.hoverHitRadiusPx) !== null;
  const hasArea =
    sceneHit(SceneHitKind.Area, x, y, CAMERA_POLICY.pointHitRadiusPx) !== null;
  postCursor({
    kind: RenderInteractionKind.Cursor,
    cursor:
      hasTrail || hasPoint || hasArea
        ? RenderCursor.Pointer
        : RenderCursor.Grab,
  });
}

function updateSelectedSide(): void {
  const selectedId = selectionIdentity()?.interactionId ?? null;
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
  const target = selectionOverlayStore.trailTarget(_activeTrailPoint);
  postInteraction({
    kind: RenderInteractionKind.TrailTooltip,
    point: _activeTrailPoint,
    x: target?.x ?? 0,
    y: target?.y ?? 0,
    visible: target !== undefined,
  });
}

function resizeCanvas(
  target: OffscreenCanvas,
  context: OffscreenCanvasRenderingContext2D,
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

type FrameInputs = Readonly<{
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  colors: RenderWorkerColors;
  globeState: RenderGlobeStateSnapshot;
  viewport: RenderViewportPayload;
}>;

function frameInputs(): FrameInputs | null {
  const globeState = globeStateController.snapshot();
  if (
    !canvas ||
    !ctx ||
    !globeState.renderTheme ||
    !_viewport
  ) {
    return null;
  }
  return {
    canvas,
    ctx,
    colors: globeState.renderTheme,
    globeState,
    viewport: _viewport,
  };
}

function updateSelectedProjection(
  selection: RenderSelectionIdentity | null,
): void {
  _hasSelectedProjection = false;
  if (selection === null) return;

  const sceneProjection =
    renderLayerCatalog.selectionAnchor(
      selection.source,
      selection.interactionId,
    );
  if (sceneProjection) {
    _hasSelectedProjection = true;
    _selectedProjectionX = sceneProjection.x;
    _selectedProjectionDepth = sceneProjection.depth;
  }
}

function scheduleNextFrameIfNeeded(
  reducedMotion: boolean,
  hasSelection: boolean,
  cameraActive: boolean,
): void {
  const hasVisualAnimation =
    !reducedMotion &&
    (renderLayerCatalog.hasTimeAnimation(reducedMotion) ||
      hasSelection);
  const needsFrame =
    renderLayerCatalog.hasFrameMotion() ||
    hasVisualAnimation ||
    cameraActive;
  if (!needsFrame || _frameScheduled) return;
  _frameScheduled = true;
  requestAnimationFrame(renderFrame);
}

function renderFrame(): void {
  _frameScheduled = false;
  const inputs = frameInputs();
  if (!inputs) return;

  const {
    canvas,
    ctx,
    colors,
    globeState,
    viewport,
  } = inputs;
  const isFlat =
    globeState.projection === RenderProjectionMode.Flat;
  const now = performance.now();
  const wallTime = Date.now();
  const selectedPosition = selectedCameraPosition(wallTime);
  const cameraActive = stepCamera(
    _camera,
    _cameraTarget,
    _pointer,
    {
      viewport: toCameraViewport(viewport),
      flat: isFlat,
      autoRotate: globeState.rotationEnabled,
      rotationSpeed: globeState.rotationSpeed,
      selectedPosition,
      deltaMilliseconds: now - _lastFrameAt,
    },
  );
  _lastFrameAt = now;
  const cam = cameraSnapshot(_camera);
  const t = wallTime * 0.003;
  const selection = selectionIdentity();
  const selId = selection?.interactionId ?? null;
  const isoMode = globeState.isolateMode;
  const isoId =
    isoMode === null ? null : selection?.interactionId ?? null;

  resizeCanvas(canvas, ctx, viewport);
  const projFn = renderLayerCatalog.drawBackdrop({
    camera: cam,
    colors,
    context: ctx,
    flat: isFlat,
    light: markerVisuals.isLight(colors.bg),
    viewport,
  });

  const projected = renderLayerCatalog.project({
    globeState,
    selection,
    time: wallTime,
  });
  const {
    aircraftEntityIsVisible,
    isolatedType,
  } = projected;
  updateSelectedProjection(selection);

  renderLayerCatalog.drawAreas({
    context: ctx,
    selectedId: selId ?? null,
    time: t,
    warningColor: colors.cycWarning,
    watchColor: colors.cycWatch,
  });

  const drawSelectedTrail = selectionIsVisible({
    selection,
    isolateMode: isoMode,
    isolatedId: isoId,
    isolatedType,
    aircraftEntityIsVisible,
    sourceIsVisible: (source) =>
      globeStateController.sourceIsVisible(source),
    searchIncludesEntity: (identity) =>
      renderLayerCatalog.searchIncludesEntity(
        identity.source,
        identity.entityId,
      ),
  });

  selectionOverlayStore.draw({
    colors,
    context: ctx,
    enabled: drawSelectedTrail,
    position: selectedPosition,
    project: projFn,
  });
  ctx.globalAlpha = 1;

  renderLayerCatalog.draw({
    colors,
    context: ctx,
    reducedMotion: globeState.reducedMotion,
    selectedId: selId,
    time: t,
    wallTime,
  });
  ctx.globalAlpha = 1;

  ctx.restore();

  renderLayerCatalog.drawFrameEdge();

  updateSelectedSide();
  updateTrailTooltip();
  postCameraSummary(now);

  scheduleNextFrameIfNeeded(
    globeState.reducedMotion,
    selection !== null,
    cameraActive,
  );
}
