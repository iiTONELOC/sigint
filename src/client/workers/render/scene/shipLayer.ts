import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import { drawSelectionRing } from "@/workers/render/primitives/selectionRing";
import { SHIP_SCENE } from "@/workers/render/scene/shipSchema";
import type { ProjectedSceneLayer } from "@/workers/render/scene/projectedLayer";
import {
  sceneRecordIsVisible,
  type SceneVisibilitySettings,
} from "@/workers/render/scene/visibility";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { zoomScale } from "@/workers/render/workerMath";

export type ShipSceneFilter = SceneVisibilitySettings &
  Readonly<{ enabled: boolean }>;

export type ShipSceneStyle = Readonly<{
  context: Ctx;
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
  return (
    view.attributeStride === SHIP_SCENE.attributeStride &&
    view.stringAttributeStride ===
      SHIP_SCENE.stringAttributeStride &&
    sceneRecordIsVisible(
      view,
      index,
      "ships",
      settings.enabled,
      settings,
    )
  );
}

function drawShip(
  view: RenderSceneView,
  layer: ProjectedSceneLayer,
  index: number,
  style: ShipSceneStyle,
): void {
  const projection = layer.projection(index);
  const id = view.ids[index];
  if (!projection || !id) return;
  const selected = id === style.selectedId;
  const size =
    2.5 * zoomScale(style.zoomLevel) * (selected ? 2 : 1);
  const angle =
    ((view.attributes[
      index * view.attributeStride +
        SHIP_SCENE.attributes.heading
    ] ?? 0) *
      Math.PI) /
    180;
  const halfWidth = size * 0.7;
  const context = style.context;
  const alpha = Math.min(
    0.85,
    0.35 +
      Math.max(0, (style.zoomLevel - 1) / 2) * 0.5,
  );

  context.globalAlpha = projection.depth * alpha;
  context.fillStyle = style.color;
  context.beginPath();
  context.moveTo(
    projection.x + Math.sin(angle) * size * 1.4,
    projection.y - Math.cos(angle) * size * 1.4,
  );
  context.lineTo(
    projection.x + Math.sin(angle + Math.PI / 2) * halfWidth,
    projection.y - Math.cos(angle + Math.PI / 2) * halfWidth,
  );
  context.lineTo(
    projection.x + Math.sin(angle + Math.PI) * size * 0.8,
    projection.y - Math.cos(angle + Math.PI) * size * 0.8,
  );
  context.lineTo(
    projection.x + Math.sin(angle - Math.PI / 2) * halfWidth,
    projection.y - Math.cos(angle - Math.PI / 2) * halfWidth,
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

export function drawShipScene(
  view: RenderSceneView,
  layer: ProjectedSceneLayer,
  style: ShipSceneStyle,
): void {
  for (const index of layer.visibleIndices()) {
    drawShip(view, layer, index, style);
  }
  style.context.globalAlpha = 1;
}
