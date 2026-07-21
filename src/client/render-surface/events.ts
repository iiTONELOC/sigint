import type { RenderInteractionPayload } from "@/workers/render/protocol";
import { isRecord } from "@shared/geo";

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

export function isRenderInteraction(
  value: unknown,
): value is RenderInteractionPayload {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "cursor") {
    return (
      value.cursor === "default" ||
      value.cursor === "grab" ||
      value.cursor === "grabbing" ||
      value.cursor === "pointer"
    );
  }
  if (value.kind === "selection") {
    return (
      (value.id === null || typeof value.id === "string") &&
      (value.pointType === null || typeof value.pointType === "string")
    );
  }
  if (value.kind === "rawCanvasClick") return true;
  if (value.kind === "selectedSide") {
    return value.side === "left" || value.side === "right";
  }
  if (value.kind !== "trailTooltip") return false;
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
