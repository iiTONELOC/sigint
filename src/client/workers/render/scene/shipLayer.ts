import { drawSelectionRing } from "@/workers/render/primitives/selectionRing";
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

function drawShip(
  view: RenderSceneView,
  projection: SceneProjection | null,
  index: number,
  style: ShipSceneStyle,
): void {
  const entityId = view.entityIds[index];
  if (!projection || !entityId) return;
  const selected = entityId === style.selectedId;
  const size =
    ShipMarkerSize.BaseSize *
    zoomScale(style.zoomLevel) *
    (selected ? ShipMarkerSize.SelectedScale : 1);
  const angle =
    ((view.attributes[
      index * view.attributeStride +
        ShipSceneAttribute.Heading
    ] ?? 0) *
      Math.PI) /
    TurnDeg.Half;
  const halfWidth = size * ShipMarkerSize.HalfWidthScale;
  const context = style.context;
  const alpha = Math.min(
    ShipMarkerAlpha.MaximumAlpha,
    ShipMarkerAlpha.BaseAlpha +
      Math.max(
        0,
        (style.zoomLevel - 1) / ShipMarkerAlpha.ZoomDivisor,
      ) *
        ShipMarkerAlpha.ZoomGain,
  );

  context.globalAlpha = projection.depth * alpha;
  context.fillStyle = style.color;
  context.beginPath();
  context.moveTo(
    projection.x +
      Math.sin(angle) * size * ShipMarkerSize.BowScale,
    projection.y -
      Math.cos(angle) * size * ShipMarkerSize.BowScale,
  );
  context.lineTo(
    projection.x +
      Math.sin(angle + Math.PI / ShipMarkerAngle.QuarterTurnDivisor) *
        halfWidth,
    projection.y -
      Math.cos(angle + Math.PI / ShipMarkerAngle.QuarterTurnDivisor) *
        halfWidth,
  );
  context.lineTo(
    projection.x +
      Math.sin(angle + Math.PI) * size * ShipMarkerSize.SternScale,
    projection.y -
      Math.cos(angle + Math.PI) * size * ShipMarkerSize.SternScale,
  );
  context.lineTo(
    projection.x +
      Math.sin(angle - Math.PI / ShipMarkerAngle.QuarterTurnDivisor) *
        halfWidth,
    projection.y -
      Math.cos(angle - Math.PI / ShipMarkerAngle.QuarterTurnDivisor) *
        halfWidth,
  );
  context.closePath();
  context.fill();
  if (selected) {
    drawSelectionRing(
      context,
      projection.x,
      projection.y,
      size,
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

  protected drawRecord(
    view: RenderSceneView,
    index: number,
    style: ShipSceneStyle,
  ): void {
    drawShip(
      view,
      this.projection.projection(index),
      index,
      style,
    );
  }
}
