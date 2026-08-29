import {
  RenderCursor,
  RenderInteractionKind,
  type RenderInteractionPayload,
  isRenderSelectionSnapshot,
} from "@/workers/render/protocol";
import { PanelSide } from "@/layout-mode/model/layoutMode";
import { isRecord } from "@shared/geo";
import { isEnumValue } from "@shared/types/enum";
import {
  isTrailPoint,
} from "@/lib/geo/trails/trailStore";

export const RENDER_SURFACE_INTERACTION_EVENT =
  "sigint-render-interaction";
export const RENDER_SURFACE_MIDDLE_CLICK_EVENT =
  "sigint-render-middle-click";
export const RENDER_SURFACE_READY_EVENT =
  "sigint-render-ready";
export const RENDER_SURFACE_DATA_READY_EVENT =
  "sigint-render-data-ready";

export function isRenderInteraction(
  value: unknown,
): value is RenderInteractionPayload {
  if (!isRecord(value)) return false;
  if (!isEnumValue(value.kind, RenderInteractionKind)) return false;
  if (value.kind === RenderInteractionKind.Cursor) {
    return isEnumValue(value.cursor, RenderCursor);
  }
  if (value.kind === RenderInteractionKind.Selection) {
    return isRenderSelectionSnapshot(value.selection);
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
