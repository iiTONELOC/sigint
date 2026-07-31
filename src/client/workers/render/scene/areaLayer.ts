import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import {
  drawSceneGeometry,
  type SceneAreaProjection,
} from "@/workers/render/scene/areaGeometry";
import {
  ProjectedSceneLayer,
  SceneHitKind,
  type SceneHit,
  type SceneProjection,
} from "@/workers/render/scene/projectedLayer";
import {
  SceneLayer,
  type SceneLayerProjectionFrame,
} from "@/workers/render/scene/sceneLayer";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { SceneGeometryKind } from "@/workers/render/sceneProtocol";
import { AreaKind } from "@/workers/render/protocol";
import {
  multiPolygonContainsPoint,
  type GeoPoint,
} from "@shared/geo";

enum SceneAreaComponentCount {
  Position = 2,
}

enum SceneAreaPositionOffset {
  Longitude = 0,
  Latitude = 1,
}

enum SceneAreaHitDistance {
  Contained = 0,
}

enum SceneAreaAlpha {
  Watch = 0.14,
  Warning = 0.22,
  SelectedWatch = 0.34,
  SelectedWarning = 0.42,
  PulseHalf = 0.5,
  SelectedPulseGain = 0.2,
}

enum SceneAreaPulse {
  Rate = 4,
}

export type SceneAreaProjectionFrame = SceneLayerProjectionFrame &
  Readonly<{
    areaProjection: SceneAreaProjection;
    screenPoint: (x: number, y: number) => GeoPoint | null;
  }>;

export type SceneAreaPaint = Readonly<{
  alpha: number;
  color: string;
}>;

export function sceneAreaAlpha(
  kind: AreaKind,
  selected: boolean,
  time: number,
): number {
  if (!selected) {
    return kind === AreaKind.Warning
      ? SceneAreaAlpha.Warning
      : SceneAreaAlpha.Watch;
  }
  const pulse =
    SceneAreaAlpha.PulseHalf +
    SceneAreaAlpha.PulseHalf *
      Math.sin(time * SceneAreaPulse.Rate);
  const base =
    kind === AreaKind.Warning
      ? SceneAreaAlpha.SelectedWarning
      : SceneAreaAlpha.SelectedWatch;
  return base + SceneAreaAlpha.SelectedPulseGain * pulse;
}

function areaHit(
  view: RenderSceneView,
  index: number,
): SceneHit | null {
  const sceneId = view.sceneIds[index];
  const entityId = view.entityIds[index];
  if (!sceneId || !entityId) return null;
  const positionOffset =
    index * SceneAreaComponentCount.Position;
  const longitude =
    view.positions[
      positionOffset + SceneAreaPositionOffset.Longitude
    ];
  const latitude =
    view.positions[
      positionOffset + SceneAreaPositionOffset.Latitude
    ];
  if (longitude === undefined || latitude === undefined) return null;
  return {
    kind: SceneHitKind.Area,
    handle: index + 1,
    sceneId,
    entityId,
    longitude,
    latitude,
    distance: SceneAreaHitDistance.Contained,
  };
}

export abstract class SceneAreaLayer<TFilter> extends SceneLayer<TFilter> {
  protected readonly anchorProjection = new ProjectedSceneLayer();

  private areaProjection: SceneAreaProjection | null = null;
  private includedIndices: number[] = [];
  private screenPoint:
    | ((x: number, y: number) => GeoPoint | null)
    | null = null;

  project(
    frame: SceneAreaProjectionFrame,
    filter: TFilter,
  ): void {
    const view = this.beginProject();
    this.areaProjection = frame.areaProjection;
    this.screenPoint = frame.screenPoint;
    this.includedIndices = [];
    const included = new Uint8Array(view.capacity);
    for (const [index, active] of view.active.entries()) {
      if (
        active === 1 &&
        this.recordIncludes(view, index, filter)
      ) {
        included[index] = 1;
        this.includedIndices.push(index);
      }
    }
    this.anchorProjection.project(view, {
      ...frame,
      includes: (index) => included[index] === 1,
    });
  }

  nearest(
    kind: SceneHitKind,
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): SceneHit | null {
    if (kind === SceneHitKind.Point) {
      return this.anchorProjection.nearest(
        x,
        y,
        radius,
        maximumCandidates,
      );
    }
    return this.containingArea(x, y);
  }

  selectionAnchor(entityId: string): SceneProjection | null {
    const view = this.view;
    if (!view) return null;
    for (const index of this.anchorProjection.visibleIndices()) {
      if (view.entityIds[index] === entityId) {
        return this.anchorProjection.projection(index);
      }
    }
    return null;
  }

  protected areaIndices(): Iterable<number> {
    return this.includedIndices;
  }

  protected markerIndices(): IterableIterator<number> {
    return this.anchorProjection.visibleIndices();
  }

  protected markerProjection(index: number): SceneProjection | null {
    return this.anchorProjection.projection(index);
  }

  protected drawAreaRecords(
    context: Ctx,
    paint: (
      view: RenderSceneView,
      index: number,
    ) => SceneAreaPaint,
  ): void {
    const view = this.view;
    const projection = this.areaProjection;
    if (!view || !projection) return;
    for (const index of this.includedIndices) {
      const geometry = view.geometries[index];
      if (geometry?.kind !== SceneGeometryKind.Polygon) continue;
      const appearance = paint(view, index);
      drawSceneGeometry(
        context,
        geometry.groups,
        projection,
        appearance.color,
        appearance.alpha,
      );
    }
    context.globalAlpha = 1;
  }

  private containingArea(x: number, y: number): SceneHit | null {
    const view = this.view;
    const point = this.screenPoint?.(x, y) ?? null;
    if (!view || !point) return null;
    for (const index of this.includedIndices) {
      const geometry = view.geometries[index];
      if (
        geometry?.kind === SceneGeometryKind.Polygon &&
        multiPolygonContainsPoint(point, geometry.groups)
      ) {
        return areaHit(view, index);
      }
    }
    return null;
  }
}
