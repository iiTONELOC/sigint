import { drawSelectionRing } from "@/workers/render/primitives/selectionRing";
import {
  addDot,
  dotBatches,
  fillDotBatch,
  markerAlphaBucket,
  trackDot,
  type DotBatchSet,
} from "@/workers/render/primitives/markerVisuals";
import { motionIsVisible } from "@/workers/render/scene/projectedLayer";
import { ShipSceneAttribute } from "@shared/scene";
import {
  RenderLayerOrder,
  ScenePointLayer,
} from "@/workers/render/scene/sceneLayer";
import {
  movingPositionAccessor,
} from "@/workers/render/scene/movingScenePosition";
import type { SceneProjection } from "@/workers/render/scene/projectedLayer";
import {
  sceneSourceIncludes,
  type EnabledSceneFilter,
} from "@/workers/render/scene/visibility";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { zoomScale } from "@/workers/render/workerMath";
import { Domain } from "@shared/domain/identity";
import { TurnDeg } from "@shared/geo";

enum ShipMarkerSize {
  BaseSize = 2.5,
  SelectedScale = 2,
  HalfWidthScale = 0.7,
  BowScale = 1.4,
  SternScale = 0.8,
}

enum ShipMarkerAlpha {
  MaximumAlpha = 0.85,
  BaseAlpha = 0.35,
  ZoomDivisor = 2,
  ZoomGain = 0.5,
}

enum ShipMarkerAngle {
  QuarterTurnDivisor = 2,
}

export type ShipSceneFilter = EnabledSceneFilter;

export type ShipSceneStyle = Readonly<{
  context: OffscreenCanvasRenderingContext2D;
  color: string;
  selectedId: string | null;
  time: number;
  zoomLevel: number;
}>;

export function shipSceneIncludes(
  view: RenderSceneView,
  index: number,
  settings: ShipSceneFilter,
): boolean {
  return sceneSourceIncludes(Domain.Ships, view, index, settings);
}

type ShipMarker = Readonly<{
  x: number;
  y: number;
  size: number;
  angle: number;
  alpha: number;
  selected: boolean;
}>;

function markerAt(
  view: RenderSceneView,
  projection: SceneProjection | null,
  index: number,
  style: ShipSceneStyle,
): ShipMarker | null {
  const entityId = view.entityIds[index];
  if (!projection || !entityId) return null;
  const selected = entityId === style.selectedId;
  const alpha = Math.min(
    ShipMarkerAlpha.MaximumAlpha,
    ShipMarkerAlpha.BaseAlpha +
      Math.max(
        0,
        (style.zoomLevel - 1) / ShipMarkerAlpha.ZoomDivisor,
      ) *
        ShipMarkerAlpha.ZoomGain,
  );
  return {
    x: projection.x,
    y: projection.y,
    size:
      ShipMarkerSize.BaseSize *
      zoomScale(style.zoomLevel) *
      (selected ? ShipMarkerSize.SelectedScale : 1),
    angle:
      ((view.attributes[
        index * view.attributeStride + ShipSceneAttribute.Heading
      ] ?? 0) *
        Math.PI) /
      TurnDeg.Half,
    alpha: projection.depth * alpha,
    selected,
  };
}

/** Add one ship hull to the current path. */
function traceShip(
  context: OffscreenCanvasRenderingContext2D,
  marker: ShipMarker,
): void {
  const { x, y, size, angle } = marker;
  const halfWidth = size * ShipMarkerSize.HalfWidthScale;
  const beam = Math.PI / ShipMarkerAngle.QuarterTurnDivisor;
  context.moveTo(
    x + Math.sin(angle) * size * ShipMarkerSize.BowScale,
    y - Math.cos(angle) * size * ShipMarkerSize.BowScale,
  );
  context.lineTo(
    x + Math.sin(angle + beam) * halfWidth,
    y - Math.cos(angle + beam) * halfWidth,
  );
  context.lineTo(
    x + Math.sin(angle + Math.PI) * size * ShipMarkerSize.SternScale,
    y - Math.cos(angle + Math.PI) * size * ShipMarkerSize.SternScale,
  );
  context.lineTo(
    x + Math.sin(angle - beam) * halfWidth,
    y - Math.cos(angle - beam) * halfWidth,
  );
  context.closePath();
}

function drawShip(
  context: OffscreenCanvasRenderingContext2D,
  marker: ShipMarker,
  style: ShipSceneStyle,
): void {
  context.globalAlpha = marker.alpha;
  context.fillStyle = style.color;
  context.beginPath();
  traceShip(context, marker);
  context.fill();
  if (marker.selected) {
    drawSelectionRing(
      context,
      marker.x,
      marker.y,
      marker.size,
      style.color,
      style.time,
    );
  }
}

export class ShipLayer extends ScenePointLayer<
  ShipSceneFilter,
  ShipSceneStyle
> {
  readonly order = RenderLayerOrder.Ships;

  constructor() {
    super(Domain.Ships, movingPositionAccessor(Domain.Ships));
  }

  protected includes(
    view: RenderSceneView,
    index: number,
    filter: ShipSceneFilter,
  ): boolean {
    return shipSceneIncludes(view, index, filter);
  }

  /** Batched: one path and one fill per alpha bucket; the selected ship
   *  keeps its own draw for the ring. */
  override draw(style: ShipSceneStyle): void {
    const view = this.view;
    if (!view) return;
    if (!motionIsVisible(style.zoomLevel)) {
      this.drawDots(view, style);
      return;
    }
    const batches = new Map<number, ShipMarker[]>();
    for (const index of this.visibleIndices()) {
      const marker = markerAt(view, this.projection.projection(index), index, style);
      if (!marker) continue;
      if (marker.selected) {
        drawShip(style.context, marker, style);
        continue;
      }
      const alpha = markerAlphaBucket(marker.alpha);
      const batch = batches.get(alpha);
      if (batch) batch.push(marker);
      else batches.set(alpha, [marker]);
    }
    for (const [alpha, batch] of batches) {
      style.context.globalAlpha = alpha;
      style.context.fillStyle = style.color;
      style.context.beginPath();
      for (const marker of batch) traceShip(style.context, marker);
      style.context.fill();
    }
    style.context.globalAlpha = 1;
  }

  /** Below the motion-detail zoom a hull is under a pixel: dots, batched. */
  private drawDots(view: RenderSceneView, style: ShipSceneStyle): void {
    const batches: DotBatchSet = new Map();
    for (const index of this.visibleIndices()) {
      const marker = markerAt(view, this.projection.projection(index), index, style);
      if (!marker) continue;
      if (marker.selected) {
        drawShip(style.context, marker, style);
        continue;
      }
      addDot(batches, trackDot(marker.x, marker.y, marker.size, style.color, marker.alpha));
    }
    for (const batch of dotBatches(batches)) fillDotBatch(style.context, batch);
    style.context.globalAlpha = 1;
  }

  protected drawRecord(
    view: RenderSceneView,
    index: number,
    style: ShipSceneStyle,
  ): void {
    const marker = markerAt(view, this.projection.projection(index), index, style);
    if (marker) drawShip(style.context, marker, style);
  }
}
