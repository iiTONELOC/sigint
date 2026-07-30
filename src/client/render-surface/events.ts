import {
  PanelSide,
  RenderCursor,
  RenderInteractionKind,
  type RenderSelectionIdentity,
  type RenderInteractionPayload,
} from "@/workers/render/protocol";
import { Domain } from "@shared/domain/identity";
import { isRecord } from "@shared/geo";
import { isEnumValue } from "@shared/types/enum";
import {
  isRenderSourceId,
} from "@/workers/data/sourceIds";
import {
  sourceForPointType,
} from "@/workers/data/sources/registry";

enum SelectionStringLength {
  Empty = 0,
}

enum SelectionRevisionBoundary {
  MinimumRevision = 0,
}

export const RENDER_SURFACE_INTERACTION_EVENT =
  "sigint-render-interaction";
export const RENDER_SURFACE_MIDDLE_CLICK_EVENT =
  "sigint-render-middle-click";
export const RENDER_SURFACE_READY_EVENT =
  "sigint-render-ready";
export const RENDER_SURFACE_DATA_READY_EVENT =
  "sigint-render-data-ready";

function isOptionalNumber(value: unknown): boolean {
  return value === undefined ||
    (typeof value === "number" && Number.isFinite(value));
}

function isTrailPoint(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value.lon === "number" &&
    Number.isFinite(value.lon) &&
    typeof value.ts === "number" &&
    Number.isFinite(value.ts) &&
    isOptionalNumber(value.altitude) &&
    isOptionalNumber(value.speed) &&
    isOptionalNumber(value.heading)
  );
}

function isSelectionIdentity(
  value: unknown,
): value is RenderSelectionIdentity {
  return (
    isRecord(value) &&
    isRenderSourceId(value.source) &&
    typeof value.entityId === "string" &&
    value.entityId.length > SelectionStringLength.Empty &&
    typeof value.interactionId === "string" &&
    value.interactionId.length > SelectionStringLength.Empty &&
    isEnumValue(value.pointType, Domain) &&
    sourceForPointType(value.pointType) === value.source
  );
}

function isSelection(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= SelectionRevisionBoundary.MinimumRevision &&
    (value.identity === null ||
      isSelectionIdentity(value.identity))
  );
}

export function isRenderInteraction(
  value: unknown,
): value is RenderInteractionPayload {
  if (!isRecord(value)) return false;
  if (!isEnumValue(value.kind, RenderInteractionKind)) return false;
  if (value.kind === RenderInteractionKind.Cursor) {
    return isEnumValue(value.cursor, RenderCursor);
  }
  if (value.kind === RenderInteractionKind.Selection) {
    return isSelection(value.selection);
  }
  if (value.kind === RenderInteractionKind.RawCanvasClick) return true;
  if (value.kind === RenderInteractionKind.SelectedSide) {
    return isEnumValue(value.side, PanelSide);
  }
  if (value.kind !== RenderInteractionKind.TrailTooltip) return false;
  return (
    (value.point === null || isTrailPoint(value.point)) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.visible === "boolean"
  );
}

export function readRenderInteraction(
  event: Event,
): RenderInteractionPayload | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail: unknown = event.detail;
  return isRenderInteraction(detail) ? detail : null;
}

export function emitRenderInteraction(
  host: HTMLElement,
  detail: RenderInteractionPayload,
): void {
  host.dispatchEvent(
    new CustomEvent<RenderInteractionPayload>(
      RENDER_SURFACE_INTERACTION_EVENT,
      { detail },
    ),
  );
}

export function emitRenderSignal(
  host: HTMLElement,
  type:
    | typeof RENDER_SURFACE_MIDDLE_CLICK_EVENT
    | typeof RENDER_SURFACE_READY_EVENT
    | typeof RENDER_SURFACE_DATA_READY_EVENT,
): void {
  host.dispatchEvent(new CustomEvent(type));
}
