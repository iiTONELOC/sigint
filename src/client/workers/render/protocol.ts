import type {
  DataPoint,
  DataType,
} from "@/features/base/dataPoints";
import type {
  TrackMotion,
  TrailPoint,
} from "@/lib/geo/trails/trailStore";
import type { RenderSourceId } from "@/workers/data/sourceIds";
import type { MilFilter } from "@shared/domain/aircraft";
import type { MinCategory } from "@/features/environmental/cyclones/types";

export enum RenderProtocolVersion {
  Current = 3,
}

export enum RenderMessageType {
  Init = "init",
  Colors = "colors",
  Viewport = "viewport",
  Presentation = "presentation",
  Input = "input",
  Focus = "focus",
  Selection = "selection",
  Dispose = "dispose",
  Ready = "ready",
  DataChannelReady = "dataChannelReady",
  Interaction = "interaction",
  Camera = "camera",
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

export type RenderWorkerColors = Readonly<{
  accent: string;
  aircraft: string;
  bg: string;
  bright: string;
  coast: string;
  coastFill: string;
  cycWarning: string;
  cycWatch: string;
  cyclones: string;
  dim: string;
  events: string;
  fires: string;
  grid: string;
  military: string;
  ocean: string;
  oceanDeep: string;
  quakes: string;
  recon: string;
  ships: string;
  weather: string;
}>;

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

export type RenderCamera = Readonly<{
  zoomFlat: number;
  zoomGlobe: number;
  panX: number;
  panY: number;
  rotY: number;
  rotX: number;
}>;

export type RenderAircraftFilter = Readonly<{
  enabled: boolean;
  showAirborne: boolean;
  showGround: boolean;
  milFilter: MilFilter;
  squawks: readonly string[];
  countries: readonly string[];
}>;

export type SelectedRenderItem = Readonly<{
  id: string;
  type: DataType;
  lat: number;
  lon: number;
  trail: readonly TrailPoint[];
  route: readonly (readonly [number, number])[] | null;
  /** Present when the track is moving; drives dead reckoning between polls. */
  motion: TrackMotion | null;
}>;

export type RenderViewportPayload = Readonly<{
  width: number;
  height: number;
  devicePixelRatio: number;
}>;

export type RenderPresentationPayload = Readonly<{
  flat: boolean;
  autoRotate: boolean;
  rotationSpeed: number;
  isolatedId: string | null;
  isolateMode: SelectedIsolateMode;
  layers: Readonly<Record<string, boolean | undefined>>;
  aircraftFilter: RenderAircraftFilter;
  earthquakeMinMagnitude: number;
  fireMinConfidence: number;
  searchMatchIds: readonly string[] | null;
  selectedItem: SelectedRenderItem | null;
  cyclonesMinCategory: MinCategory;
  cyclonesShowForecast: boolean;
  cyclonesShowCone: boolean;
  cyclonesShowWindField: boolean;
  cyclonesShowWarnings: boolean;
  cyclonesShowModels: boolean;
  cyclonesHiddenModels: readonly string[];
  prefersReducedMotion: boolean;
}>;

export type RenderFocusPayload = Readonly<{
  id: string;
  latitude: number;
  longitude: number;
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
  // Points arrive from the DataWorker over the data port. React only still
  // owns the theme, so that is all it sends about what gets drawn.
  | Readonly<{
      type: RenderMessageType.Colors;
      payload: RenderWorkerColors;
    }>
  | Readonly<{
      type: RenderMessageType.Viewport;
      payload: RenderViewportPayload;
    }>
  | Readonly<{
      type: RenderMessageType.Presentation;
      payload: RenderPresentationPayload;
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
