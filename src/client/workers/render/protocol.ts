import type { DataPoint } from "@/features/base/dataPoints";
import type { TrailPoint } from "@/lib/geo/trailService";

export const RENDER_PROTOCOL_VERSION: 2 = 2;

export type RenderPoint = DataPoint;

export type RenderWorkerColors = Readonly<{
  accent: string;
  aircraft: string;
  bg: string;
  bright: string;
  coast: string;
  coastFill: string;
  cyclones: string;
  dim: string;
  events: string;
  fires: string;
  grid: string;
  ocean: string;
  oceanDeep: string;
  quakes: string;
  recon: string;
  ships: string;
  weather: string;
}>;

export type RenderAreaFeature = Readonly<{
  id?: string;
  kind?: string;
  geometry?: unknown;
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
  milFilter: "all" | "military" | "civilian" | "recon";
  squawks: readonly string[];
  countries: readonly string[];
}>;

export type SelectedRenderItem = Readonly<{
  id: string;
  type: DataPoint["type"];
  lat: number;
  lon: number;
  trail: readonly TrailPoint[];
  route: readonly (readonly [number, number])[] | null;
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
  selectedId: string | null;
  isolatedId: string | null;
  isolateMode: "solo" | "focus" | null;
  layers: Readonly<Record<string, boolean | undefined>>;
  aircraftFilter: RenderAircraftFilter;
  earthquakeMinMagnitude: number;
  fireMinConfidence: number;
  searchMatchIds: readonly string[] | null;
  selectedItem: SelectedRenderItem | null;
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
  kind: "focus" | "reveal";
}>;

export type RenderInputPayload =
  | Readonly<{
      kind: "pointer";
      phase: "start" | "move" | "end" | "cancel" | "hover";
      x: number;
      y: number;
    }>
  | Readonly<{
      kind: "pinch";
      phase: "start" | "move" | "end";
      centerX: number;
      centerY: number;
      distance: number;
    }>
  | Readonly<{
      kind: "wheel";
      x: number;
      y: number;
      deltaY: number;
    }>
  | Readonly<{
      kind: "key";
      code: string;
    }>;

export type RenderCursor = "default" | "grab" | "grabbing" | "pointer";

export type RenderInteractionPayload =
  | Readonly<{ kind: "cursor"; cursor: RenderCursor }>
  | Readonly<{
      kind: "selection";
      id: string | null;
      pointType: DataPoint["type"] | null;
    }>
  | Readonly<{ kind: "rawCanvasClick" }>
  | Readonly<{
      kind: "trailTooltip";
      point: TrailPoint | null;
      x: number;
      y: number;
      visible: boolean;
    }>
  | Readonly<{ kind: "selectedSide"; side: "left" | "right" }>;


type RenderProtocolEnvelope = Readonly<{
  protocolVersion: typeof RENDER_PROTOCOL_VERSION;
  sessionId: string;
  sequence: number;
}>;

export type RenderWorkerCommandBody =
  | Readonly<{
      type: "init";
      canvas: OffscreenCanvas;
      dataPort?: MessagePort;
    }>
  | Readonly<{
      type: "data";
      payload: Readonly<{
        colors: RenderWorkerColors;
        source: string;
        reset: boolean;
        data: readonly DataPoint[];
        done: boolean;
      }>;
    }>
  | Readonly<{
      type: "trails";
      ids: readonly string[];
      values: Float32Array;
      timestamps: Float64Array;
    }>
  | Readonly<{
      type: "warnings" | "weatherAlerts";
      payload: Readonly<{
        features: readonly RenderAreaFeature[];
        warningColor: string;
        watchColor: string;
      }>;
    }>
  | Readonly<{ type: "viewport"; payload: RenderViewportPayload }>
  | Readonly<{
      type: "presentation";
      payload: RenderPresentationPayload;
    }>
  | Readonly<{ type: "input"; payload: RenderInputPayload }>
  | Readonly<{ type: "focus"; payload: RenderFocusPayload }>
  | Readonly<{ type: "dispose" }>;

type WithEnvelope<T> = T extends object ? T & RenderProtocolEnvelope : never;

export type RenderWorkerCommand = WithEnvelope<RenderWorkerCommandBody>;

type RenderWorkerEventBody =
  | Readonly<{ type: "ready" }>
  | Readonly<{ type: "dataChannelReady" }>
  | Readonly<{
      type: "interaction";
      payload: RenderInteractionPayload;
    }>
  | Readonly<{
      type: "camera";
      payload: RenderCamera;
    }>;

export type RenderWorkerEvent = WithEnvelope<RenderWorkerEventBody>;

export function createRenderCommand<T extends RenderWorkerCommandBody>(
  body: T,
  sessionId: string,
  sequence: number,
): T & RenderProtocolEnvelope {
  return {
    ...body,
    protocolVersion: RENDER_PROTOCOL_VERSION,
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
  if (header.protocolVersion !== RENDER_PROTOCOL_VERSION) return false;
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
    startsSession: command.type === "init",
  });
}
