import {
  SceneAreaLayer,
  sceneAreaAlpha,
} from "@/workers/render/scene/areaLayer";
import {
  RenderLayerOrder,
} from "@/workers/render/scene/sceneLayer";
import {
  sceneRecordIsVisible,
  type EnabledSceneFilter,
} from "@/workers/render/scene/visibility";
import {
  sceneNumericAttribute,
  type RenderSceneView,
} from "@/workers/render/sceneStore";
import {
  areaKindFromRank,
  AreaKind,
} from "@shared/domain/cyclones";
import { Domain } from "@shared/domain/identity";
import { sceneSchemaMatches } from "@shared/domain/pointSource";
import { CycloneWarningSceneAttribute } from "@shared/scene";

export type CycloneWarningSceneFilter = EnabledSceneFilter;

export type CycloneWarningSceneStyle = Readonly<{
  context: OffscreenCanvasRenderingContext2D;
  selectedId: string | null;
  time: number;
  warningColor: string;
  watchColor: string;
}>;

function warningKindAt(
  view: RenderSceneView,
  index: number,
): AreaKind {
  return areaKindFromRank(
    sceneNumericAttribute(
      view,
      index,
      CycloneWarningSceneAttribute.Kind,
    ),
  );
}

export function cycloneWarningSceneIncludes(
  view: RenderSceneView,
  index: number,
  filter: CycloneWarningSceneFilter,
): boolean {
  return (
    sceneSchemaMatches(
      Domain.CycloneWarnings,
      view.attributeStride,
      view.stringAttributeStride,
    ) &&
    sceneRecordIsVisible(
      view,
      index,
      Domain.CyclonesWarning,
      filter.enabled,
      filter,
    )
  );
}

export class CycloneWarningLayer extends SceneAreaLayer<CycloneWarningSceneFilter> {
  readonly order = RenderLayerOrder.CycloneWarning;

  constructor() {
    super(Domain.CycloneWarnings);
  }

  drawAreas(style: CycloneWarningSceneStyle): void {
    this.drawAreaRecords(style.context, (view, index) => {
      const kind = warningKindAt(view, index);
      return {
        color:
          kind === AreaKind.Warning
            ? style.warningColor
            : style.watchColor,
        alpha: sceneAreaAlpha(
          kind,
          view.entityIds[index] === style.selectedId,
          style.time,
        ),
      };
    });
  }

  protected includes(
    view: RenderSceneView,
    index: number,
    filter: CycloneWarningSceneFilter,
  ): boolean {
    return cycloneWarningSceneIncludes(view, index, filter);
  }
}
