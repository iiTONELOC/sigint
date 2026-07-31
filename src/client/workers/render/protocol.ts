import type {
  DataPoint,
  DataType,
} from "@/features/base/dataPoints";
import type {
  TrailPoint,
} from "@/lib/geo/trails/trailStore";
import type {
  AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";
import {
  isRenderSourceId,
  type RenderSourceId,
} from "@/workers/data/sourceIds";
import {
  sourceForPointType,
} from "@/workers/data/sources/registry";
import {
  MIN_CATEGORY_CHOICES,
  type MinCategory,
} from "@shared/domain/cycloneClassification";
import {
  MilFilter,
  SquawkBucket,
} from "@shared/domain/aircraft";
import type {
  AircraftFilterValues,
} from "@shared/domain/aircraftFilter";
import { isRecord } from "@shared/geo";
import { Domain } from "@shared/domain/identity";

export enum RenderProtocolVersion {
  Current = 1,
}

export enum RenderMessageType {
  Init = "init",
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
  SetEarthquakeFilter = "setEarthquakeFilter",
  SetFireFilter = "setFireFilter",
  SetCycloneFilter = "setCycloneFilter",
  ToggleCycloneLayer = "toggleCycloneLayer",
  ToggleCycloneModel = "toggleCycloneModel",
  ToggleAllCycloneModels = "toggleAllCycloneModels",
  SetIsolation = "setIsolation",
  SetReducedMotion = "setReducedMotion",
  SetRenderTheme = "setRenderTheme",
}

export enum RenderCycloneLayer {
  Forecast = "showForecast",
  Cone = "showCone",
  WindField = "showWindField",
  Models = "showModels",
  Warnings = "showWarnings",
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

export type RenderPoint = DataPoint;

export enum RenderColorKey {
  Accent = "accent",
  Aircraft = "aircraft",
  Background = "bg",
  Bright = "bright",
  Coast = "coast",
  CoastFill = "coastFill",
  CycloneWarning = "cycWarning",
  CycloneWatch = "cycWatch",
  Cyclones = "cyclones",
  Dim = "dim",
  Events = "events",
  Fires = "fires",
  Grid = "grid",
  Military = "military",
  Ocean = "ocean",
  OceanDeep = "oceanDeep",
  Quakes = "quakes",
  Recon = "recon",
  Ships = "ships",
  Weather = "weather",
}

export type RenderWorkerColors = Readonly<
  Record<RenderColorKey, string>
>;

export enum AreaKind {
  Watch = "watch",
  Warning = "warning",
}

// Ascending urgency, so a rank is the position in the declared order.
const AREA_KIND_ORDER: readonly AreaKind[] = Object.values(AreaKind);

export function areaKindRank(kind: AreaKind): number {
  return AREA_KIND_ORDER.indexOf(kind);
}

export function areaKindFromRank(rank: number): AreaKind {
  return AREA_KIND_ORDER[rank] ?? AreaKind.Watch;
}

export enum PanelSide {
  Left = "left",
  Right = "right",
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

export type RenderLayerId =
  | Domain.Ships
  | Domain.Events
  | Domain.Quakes
  | Domain.Fires
  | Domain.Weather
  | Domain.Cyclones;

export const RENDER_LAYER_IDS: readonly RenderLayerId[] = [
  Domain.Ships,
  Domain.Events,
  Domain.Quakes,
  Domain.Fires,
  Domain.Weather,
  Domain.Cyclones,
];

export type RenderLayerVisibility = Readonly<{
  [Domain.Ships]: boolean;
  [Domain.Events]: boolean;
  [Domain.Quakes]: boolean;
  [Domain.Fires]: boolean;
  [Domain.Weather]: boolean;
  [Domain.Cyclones]: boolean;
}>;

export type RenderAircraftFilter = AircraftFilterValues;

export type RenderCycloneFilter = Readonly<{
  minimumCategory: MinCategory;
  showForecast: boolean;
  showCone: boolean;
  showWindField: boolean;
  showModels: boolean;
  showWarnings: boolean;
  hiddenModels: readonly string[];
}>;

export type RenderGlobeStateSnapshot = Readonly<{
  projection: RenderProjectionMode;
  rotationEnabled: boolean;
  rotationSpeed: number;
  layers: RenderLayerVisibility;
  aircraftFilter: RenderAircraftFilter;
  earthquakeMinimumMagnitude: number;
  fireMinimumConfidence: number;
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
      filter: RenderAircraftFilter;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetEarthquakeFilter;
      minimumMagnitude: number;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetFireFilter;
      minimumConfidence: number;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.SetCycloneFilter;
      filter: RenderCycloneFilter;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.ToggleCycloneLayer;
      layer: RenderCycloneLayer;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.ToggleCycloneModel;
      model: string;
    }>
  | Readonly<{
      kind: RenderGlobeCommandKind.ToggleAllCycloneModels;
      models: readonly string[];
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

export enum RenderFilterBoundary {
  Minimum = 0,
}

enum RenderFilterTextLength {
  Empty = 0,
}

export function isRenderLayerId(
  value: unknown,
): value is RenderLayerId {
  return RENDER_LAYER_IDS.includes(value as RenderLayerId);
}

function isFiniteFilterValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= RenderFilterBoundary.Minimum
  );
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

function isRenderLayerVisibility(
  value: unknown,
): value is RenderLayerVisibility {
  return (
    isRecord(value) &&
    RENDER_LAYER_IDS.every(
      (layer) => typeof value[layer] === "boolean",
    )
  );
}

function isRenderAircraftFilter(
  value: unknown,
): value is RenderAircraftFilter {
  return (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    typeof value.showAirborne === "boolean" &&
    typeof value.showGround === "boolean" &&
    Object.values(MilFilter).includes(value.milFilter as MilFilter) &&
    Array.isArray(value.squawks) &&
    value.squawks.every((squawk) =>
      Object.values(SquawkBucket).includes(squawk as SquawkBucket)
    ) &&
    new Set(value.squawks).size === value.squawks.length &&
    isUniqueNonEmptyStrings(value.countries)
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
    typeof value.showForecast === "boolean" &&
    typeof value.showCone === "boolean" &&
    typeof value.showWindField === "boolean" &&
    typeof value.showModels === "boolean" &&
    typeof value.showWarnings === "boolean" &&
    isUniqueNonEmptyStrings(value.hiddenModels)
  );
}

export function isRenderWorkerColors(
  value: unknown,
): value is RenderWorkerColors {
  const keys = Object.values(RenderColorKey);
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(
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
    isRenderAircraftFilter(value.aircraftFilter) &&
    isFiniteFilterValue(value.earthquakeMinimumMagnitude) &&
    isFiniteFilterValue(value.fireMinimumConfidence) &&
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
      return isRenderAircraftFilter(value.filter);
    case RenderGlobeCommandKind.SetEarthquakeFilter:
      return isFiniteFilterValue(value.minimumMagnitude);
    case RenderGlobeCommandKind.SetFireFilter:
      return isFiniteFilterValue(value.minimumConfidence);
    case RenderGlobeCommandKind.SetCycloneFilter:
      return isRenderCycloneFilter(value.filter);
    case RenderGlobeCommandKind.ToggleCycloneLayer:
      return Object.values(RenderCycloneLayer).includes(
        value.layer as RenderCycloneLayer,
      );
    case RenderGlobeCommandKind.ToggleCycloneModel:
      return (
        typeof value.model === "string" &&
        value.model.length > RenderFilterTextLength.Empty
      );
    case RenderGlobeCommandKind.ToggleAllCycloneModels:
      return isUniqueNonEmptyStrings(value.models);
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
