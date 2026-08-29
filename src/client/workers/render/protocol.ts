import type { DataType } from "@/features/base/dataPoints";
import type { PanelSide } from "@/layout-mode/model/layoutMode";
import type {
  TrailPoint,
} from "@/lib/geo/trails/trailStore";
import type {
  AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";
import {
  isRenderSourceId,
  type RenderSourceId,
} from "@shared/source";
import {
  sourceForPointType,
} from "@shared/domain/pointSource";
import {
  MIN_CATEGORY_CHOICES,
  type MinCategory,
} from "@shared/domain/cyclones";
import {
  isAircraftFilter,
  type AircraftFilterValues,
} from "@shared/domain/aircraftFilter";
import { isRecord, type GeoMultiPolygon } from "@shared/geo";
import {
  RENDER_THEME_COLOR_KEYS,
  type RenderWorkerColors,
} from "@shared/domain/theme";
import {
  isRenderLayerId,
  registeredRenderLayerIds,
  type RenderLayerId,
  type RenderLayerVisibility,
} from "@/workers/render/policy";

export enum RenderProtocolVersion {
  Current = 1,
}

export enum RenderMessageType {
  Init = "init",
  Land = "land",
  Viewport = "viewport",
  GlobeCommand = "globeCommand",
  Input = "input",
  Focus = "focus",
  Selection = "selection",
  Search = "search",
  Dispose = "dispose",
  Ready = "ready",
  DataChannelReady = "dataChannelReady",
  Interaction = "interaction",
  Camera = "camera",
  GlobeState = "globeState",
}

export enum RenderProjectionMode {
  Globe = "globe",
  Flat = "flat",
}

export enum RenderGlobeCommandKind {
  SetProjection = "setProjection",
  SetRotationEnabled = "setRotationEnabled",
  ToggleRotation = "toggleRotation",
  SetRotationSpeed = "setRotationSpeed",
  SetLayerVisibility = "setLayerVisibility",
  ToggleLayer = "toggleLayer",
  SetAircraftFilter = "setAircraftFilter",
  SetCycloneFilter = "setCycloneFilter",
  ToggleCycloneLayer = "toggleCycloneLayer",
  ToggleCycloneModel = "toggleCycloneModel",
  ToggleAllCycloneModels = "toggleAllCycloneModels",
  ToggleCycloneWarnings = "toggleCycloneWarnings",
  SetIsolation = "setIsolation",
  SetReducedMotion = "setReducedMotion",
  SetRenderTheme = "setRenderTheme",
}

export enum RenderCycloneLayer {
  Forecast = "showForecast",
  Cone = "showCone",
  WindField = "showWindField",
  Models = "showModels",
}

export enum RenderRotationSpeedPolicy {
  MinimumAndStep = 0.01,
  Default = 0.35,
  Maximum = 2,
}

export enum RenderFocusKind {
  Focus = "focus",
  Reveal = "reveal",
  Double = "double",
}

export enum RenderInputKind {
  Pointer = "pointer",
  Pinch = "pinch",
  Wheel = "wheel",
  Key = "key",
}

export enum RenderInputPhase {
  Start = "start",
  Move = "move",
  End = "end",
  Cancel = "cancel",
  Hover = "hover",
}

export enum RenderCameraKey {
  ArrowLeft = "ArrowLeft",
  ArrowRight = "ArrowRight",
  ArrowUp = "ArrowUp",
  ArrowDown = "ArrowDown",
  Equal = "Equal",
  NumpadAdd = "NumpadAdd",
  Minus = "Minus",
  NumpadSubtract = "NumpadSubtract",
}

export enum RenderCursor {
  Default = "default",
  Grab = "grab",
  Grabbing = "grabbing",
  Pointer = "pointer",
}

export enum RenderInteractionKind {
  Cursor = "cursor",
  Selection = "selection",
  RawCanvasClick = "rawCanvasClick",
  TrailTooltip = "trailTooltip",
  SelectedSide = "selectedSide",
}

export enum IsolateMode {
  Solo = "solo",
  Focus = "focus",
}

export type SelectedIsolateMode = IsolateMode | null;

export function isSelectedIsolateMode(
  value: unknown,
): value is SelectedIsolateMode {
  return (
    value === null ||
    value === IsolateMode.Solo ||
    value === IsolateMode.Focus
  );
}

export type RenderSelectionIdentity = Readonly<{
  source: RenderSourceId;
  entityId: string;
  interactionId: string;
  pointType: DataType;
}>;

export type RenderSelectionSnapshot = Readonly<{
  revision: number;
  identity: RenderSelectionIdentity | null;
}>;

export type RenderSearchSnapshot = Readonly<{
  revision: number;
  text: string | null;
}>;

export type RenderCycloneOverlay = Readonly<{
  showForecast: boolean;
  showCone: boolean;
  showWindField: boolean;
  showModels: boolean;
  hiddenModels: readonly string[];
}>;

export const DEFAULT_RENDER_CYCLONE_OVERLAY: RenderCycloneOverlay =
  Object.freeze({
    showForecast: true,
    showCone: true,
    showWindField: false,
    showModels: false,
    hiddenModels: Object.freeze([]),
  });

export type RenderCycloneFilter = Readonly<{
  minimumCategory: MinCategory;
  showWarnings: boolean;
  overlays: Readonly<Record<string, RenderCycloneOverlay>>;
}>;

export type RenderGlobeStateSnapshot = Readonly<{
  projection: RenderProjectionMode;
  rotationEnabled: boolean;
  rotationSpeed: number;
  layers: RenderLayerVisibility;
  aircraftFilter: AircraftFilterValues;
  cycloneFilter: RenderCycloneFilter;
  isolateMode: SelectedIsolateMode;
  reducedMotion: boolean;
  renderTheme: RenderWorkerColors | null;
}>;

export type RenderGlobeCommand =
  | Readonly<{
      kind: RenderGlobeCommandKind.SetProjection;
      projection: RenderProjectionMode;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetRotationEnabled;
      enabled: boolean;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.ToggleRotation;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetRotationSpeed;
      speed: number;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetLayerVisibility;
      layer: RenderLayerId;
      visible: boolean;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.ToggleLayer;
      layer: RenderLayerId;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetAircraftFilter;
      filter: AircraftFilterValues;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetCycloneFilter;
      filter: RenderCycloneFilter;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.ToggleCycloneLayer;
      entityId: string;
      layer: RenderCycloneLayer;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.ToggleCycloneModel;
      entityId: string;
      model: string;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.ToggleAllCycloneModels;
      entityId: string;
      models: readonly string[];
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.ToggleCycloneWarnings;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetIsolation;
      mode: SelectedIsolateMode;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetReducedMotion;
      reducedMotion: boolean;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetRenderTheme;
      theme: RenderWorkerColors;
    }>;

export function renderSelectionIdentitiesEqual(
  left: RenderSelectionIdentity | null,
  right: RenderSelectionIdentity | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.source === right.source &&
    left.entityId === right.entityId &&
    left.interactionId === right.interactionId &&
    left.pointType === right.pointType
  );
}

export type RenderSelectionOverlay = Readonly<{
  selection: RenderSelectionSnapshot;
  trail: readonly TrailPoint[];
  route: readonly AircraftRouteWaypoint[] | null;
}>;

enum RenderSelectionStringLength {
  Empty = 0,
}

enum RenderSelectionRevisionBoundary {
  Minimum = 0,
}

enum RenderSearchRevisionBoundary {
  Minimum = 1,
}

enum RenderSearchTextLength {
  Empty = 0,
}

enum RenderFilterTextLength {
  Empty = 0,
}

function isUniqueNonEmptyStrings(
  value: unknown,
): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.length > RenderFilterTextLength.Empty,
    ) &&
    new Set(value).size === value.length
  );
}

function isRenderCycloneOverlay(
  value: unknown,
): value is RenderCycloneOverlay {
  return (
    isRecord(value) &&
    typeof value.showForecast === "boolean" &&
    typeof value.showCone === "boolean" &&
    typeof value.showWindField === "boolean" &&
    typeof value.showModels === "boolean" &&
    isUniqueNonEmptyStrings(value.hiddenModels)
  );
}

function isRenderLayerVisibility(
  value: unknown,
): value is RenderLayerVisibility {
  return (
    isRecord(value) &&
    registeredRenderLayerIds().every(
      (layer) => typeof value[layer] === "boolean",
    )
  );
}

function isRenderCycloneFilter(
  value: unknown,
): value is RenderCycloneFilter {
  return (
    isRecord(value) &&
    typeof value.minimumCategory === "number" &&
    MIN_CATEGORY_CHOICES.includes(
      value.minimumCategory as MinCategory,
    ) &&
    typeof value.showWarnings === "boolean" &&
    isRecord(value.overlays) &&
    Object.entries(value.overlays).every(
      ([entityId, overlay]) =>
        entityId.length > RenderFilterTextLength.Empty &&
        isRenderCycloneOverlay(overlay),
    )
  );
}

export function isRenderWorkerColors(
  value: unknown,
): value is RenderWorkerColors {
  return (
    isRecord(value) &&
    Object.keys(value).length === RENDER_THEME_COLOR_KEYS.length &&
    RENDER_THEME_COLOR_KEYS.every(
      (key) =>
        typeof value[key] === "string" &&
        value[key].trim().length > RenderFilterTextLength.Empty,
    )
  );
}

export function isRenderSelectionIdentity(
  value: unknown,
): value is RenderSelectionIdentity {
  return (
    isRecord(value) &&
    isRenderSourceId(value.source) &&
    typeof value.entityId === "string" &&
    value.entityId.length > RenderSelectionStringLength.Empty &&
    typeof value.interactionId === "string" &&
    value.interactionId.length > RenderSelectionStringLength.Empty &&
    typeof value.pointType === "string" &&
    sourceForPointType(value.pointType) === value.source
  );
}

export function isRenderSelectionSnapshot(
  value: unknown,
): value is RenderSelectionSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= RenderSelectionRevisionBoundary.Minimum &&
    (value.identity === null ||
      isRenderSelectionIdentity(value.identity))
  );
}

export function isRenderSearchSnapshot(
  value: unknown,
): value is RenderSearchSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= RenderSearchRevisionBoundary.Minimum &&
    (
      value.text === null ||
      (
        typeof value.text === "string" &&
        value.text.length > RenderSearchTextLength.Empty &&
        value.text === value.text.trim()
      )
    )
  );
}

export function isRenderRotationSpeed(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= RenderRotationSpeedPolicy.MinimumAndStep &&
    value <= RenderRotationSpeedPolicy.Maximum
  );
}

export function isRenderGlobeStateSnapshot(
  value: unknown,
): value is RenderGlobeStateSnapshot {
  return (
    isRecord(value) &&
    (
      value.projection === RenderProjectionMode.Globe ||
      value.projection === RenderProjectionMode.Flat
    ) &&
    typeof value.rotationEnabled === "boolean" &&
    isRenderRotationSpeed(value.rotationSpeed) &&
    isRenderLayerVisibility(value.layers) &&
    isAircraftFilter(value.aircraftFilter) &&
    isRenderCycloneFilter(value.cycloneFilter) &&
    isSelectedIsolateMode(value.isolateMode) &&
    typeof value.reducedMotion === "boolean" &&
    (
      value.renderTheme === null ||
      isRenderWorkerColors(value.renderTheme)
    )
  );
}

export function isRenderGlobeCommand(
  value: unknown,
): value is RenderGlobeCommand {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case RenderGlobeCommandKind.SetProjection:
      return (
        value.projection === RenderProjectionMode.Globe ||
        value.projection === RenderProjectionMode.Flat
      );
    case RenderGlobeCommandKind.SetRotationEnabled:
      return typeof value.enabled === "boolean";
    case RenderGlobeCommandKind.ToggleRotation:
      return true;
    case RenderGlobeCommandKind.SetRotationSpeed:
      return isRenderRotationSpeed(value.speed);
    case RenderGlobeCommandKind.SetLayerVisibility:
      return (
        isRenderLayerId(value.layer) &&
        typeof value.visible === "boolean"
      );
    case RenderGlobeCommandKind.ToggleLayer:
      return isRenderLayerId(value.layer);
    case RenderGlobeCommandKind.SetAircraftFilter:
      return isAircraftFilter(value.filter);
    case RenderGlobeCommandKind.SetCycloneFilter:
      return isRenderCycloneFilter(value.filter);
    case RenderGlobeCommandKind.ToggleCycloneLayer:
      return (
        typeof value.entityId === "string" &&
        value.entityId.length > RenderFilterTextLength.Empty &&
        Object.values(RenderCycloneLayer).includes(
          value.layer as RenderCycloneLayer,
        )
      );
    case RenderGlobeCommandKind.ToggleCycloneModel:
      return (
        typeof value.entityId === "string" &&
        value.entityId.length > RenderFilterTextLength.Empty &&
        typeof value.model === "string" &&
        value.model.length > RenderFilterTextLength.Empty
      );
    case RenderGlobeCommandKind.ToggleAllCycloneModels:
      return (
        typeof value.entityId === "string" &&
        value.entityId.length > RenderFilterTextLength.Empty &&
        isUniqueNonEmptyStrings(value.models)
      );
    case RenderGlobeCommandKind.ToggleCycloneWarnings:
      return true;
    case RenderGlobeCommandKind.SetIsolation:
      return isSelectedIsolateMode(value.mode);
    case RenderGlobeCommandKind.SetReducedMotion:
      return typeof value.reducedMotion === "boolean";
    case RenderGlobeCommandKind.SetRenderTheme:
      return isRenderWorkerColors(value.theme);
    default:
      return false;
  }
}

export type RenderCamera = Readonly<{
  zoomFlat: number;
  zoomGlobe: number;
  panX: number;
  panY: number;
  rotY: number;
  rotX: number;
}>;

export type RenderViewportPayload = Readonly<{
  width: number;
  height: number;
  devicePixelRatio: number;
  isMobile: boolean;
}>;

export type RenderFocusPayload = Readonly<{
  source: RenderSourceId;
  entityId: string;
  kind: RenderFocusKind.Focus | RenderFocusKind.Reveal;
}>;

export type RenderInputPayload =
  | Readonly<{
      kind: RenderInputKind.Pointer;
      phase: RenderInputPhase;
      x: number;
      y: number;
    }>
  | Readonly<{
      kind: RenderInputKind.Pinch;
      phase:
        | RenderInputPhase.Start
        | RenderInputPhase.Move
        | RenderInputPhase.End;
      centerX: number;
      centerY: number;
      distance: number;
    }>
  | Readonly<{
      kind: RenderInputKind.Wheel;
      x: number;
      y: number;
      deltaY: number;
    }>
  | Readonly<{
      kind: RenderInputKind.Key;
      code: RenderCameraKey;
    }>;

export type RenderInteractionPayload =
  | Readonly<{
      kind: RenderInteractionKind.Cursor;
      cursor: RenderCursor;
    }>
  | Readonly<{
      kind: RenderInteractionKind.Selection;
      selection: RenderSelectionSnapshot;
    }>
  | Readonly<{ kind: RenderInteractionKind.RawCanvasClick }>
  | Readonly<{
      kind: RenderInteractionKind.TrailTooltip;
      point: TrailPoint | null;
      x: number;
      y: number;
      visible: boolean;
    }>
  | Readonly<{
      kind: RenderInteractionKind.SelectedSide;
      side: PanelSide;
    }>;


type RenderProtocolEnvelope = Readonly<{
  protocolVersion: RenderProtocolVersion;
  sessionId: string;
  sequence: number;
}>;

export type RenderWorkerCommandBody =
  | Readonly<{
      type: RenderMessageType.Init;
      canvas: OffscreenCanvas;
      dataPort?: MessagePort;
    }>
  | Readonly<{
      type: RenderMessageType.Land;
      payload: GeoMultiPolygon;
    }>
  | Readonly<{
      type: RenderMessageType.Viewport;
      payload: RenderViewportPayload;
    }>
  | Readonly<{
      type: RenderMessageType.GlobeCommand;
      payload: RenderGlobeCommand;
    }>
  | Readonly<{
      type: RenderMessageType.Input;
      payload: RenderInputPayload;
    }>
  | Readonly<{
      type: RenderMessageType.Focus;
      payload: RenderFocusPayload;
    }>
  | Readonly<{
      type: RenderMessageType.Selection;
      payload: RenderSelectionIdentity | null;
    }>
  | Readonly<{
      type: RenderMessageType.Search;
      payload: string | null;
    }>
  | Readonly<{ type: RenderMessageType.Dispose }>;

type WithEnvelope<T> = T extends object ? T & RenderProtocolEnvelope : never;

export type RenderWorkerCommand = WithEnvelope<RenderWorkerCommandBody>;

export type RenderWorkerEventBody =
  | Readonly<{ type: RenderMessageType.Ready }>
  | Readonly<{ type: RenderMessageType.DataChannelReady }>
  | Readonly<{
      type: RenderMessageType.Interaction;
      payload: RenderInteractionPayload;
    }>
  | Readonly<{
      type: RenderMessageType.Camera;
      payload: RenderCamera;
    }>
  | Readonly<{
      type: RenderMessageType.GlobeState;
      payload: RenderGlobeStateSnapshot;
    }>;

export type RenderWorkerEvent = WithEnvelope<RenderWorkerEventBody>;

export function createRenderMessage<
  T extends RenderWorkerCommandBody | RenderWorkerEventBody,
>(
  body: T,
  sessionId: string,
  sequence: number,
): T & RenderProtocolEnvelope {
  return {
    ...body,
    protocolVersion: RenderProtocolVersion.Current,
    sessionId,
    sequence,
  };
}

export type RenderProtocolState = {
  sessionId: string | null;
  sequence: number;
};

export type RenderProtocolHeader = Readonly<{
  protocolVersion: number;
  sessionId: string;
  sequence: number;
  startsSession: boolean;
}>;

export function acceptRenderHeader(
  state: RenderProtocolState,
  header: RenderProtocolHeader,
): boolean {
  if (header.protocolVersion !== RenderProtocolVersion.Current) {
    return false;
  }
  if (header.startsSession) {
    if (
      header.sessionId === state.sessionId &&
      header.sequence <= state.sequence
    ) {
      return false;
    }
    state.sessionId = header.sessionId;
    state.sequence = header.sequence;
    return true;
  }
  if (header.sessionId !== state.sessionId) return false;
  if (header.sequence <= state.sequence) return false;
  state.sequence = header.sequence;
  return true;
}

export function acceptRenderCommand(
  state: RenderProtocolState,
  command: RenderWorkerCommand,
): boolean {
  return acceptRenderHeader(state, {
    protocolVersion: command.protocolVersion,
    sessionId: command.sessionId,
    sequence: command.sequence,
    startsSession: command.type === RenderMessageType.Init,
  });
}
