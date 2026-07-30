import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import type { RenderSourceId } from "@/workers/data/sourceIds";
import {
  ProjectedSceneLayer,
  type SceneHit,
  type SceneProjection,
  type SceneProjectionFrame,
} from "@/workers/render/scene/projectedLayer";
import type { SceneSourceCommand } from "@/workers/render/sceneProtocol";
import {
  SceneStore,
  type RenderSceneView,
} from "@/workers/render/sceneStore";

export enum RenderLayerOrder {
  Aircraft = 0,
  Ships = 1,
  Fire = 2,
  Events = 3,
  Earthquake = 4,
  Weather = 5,
  CycloneForecast = 6,
  Cyclones = 7,
}

export type SceneLayerProjectionFrame = Omit<
  SceneProjectionFrame,
  "includes"
>;

export type SceneLayerStyle = Readonly<{ context: Ctx }>;

export interface RenderLayer {
  readonly order: RenderLayerOrder;
  readonly source: RenderSourceId;
  apply(patch: SceneSourceCommand): void;
  hasTimeAnimation(reducedMotion: boolean): boolean;
  nearest(
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): SceneHit | null;
  selectionAnchor(entityId: string): SceneProjection | null;
}

export abstract class ScenePointLayer<
  TFilter,
  TStyle extends SceneLayerStyle,
> implements RenderLayer
{
  abstract readonly order: RenderLayerOrder;
  readonly source: RenderSourceId;

  protected readonly projection = new ProjectedSceneLayer();
  protected view: RenderSceneView | null = null;
  private readonly store: SceneStore;

  protected constructor(source: RenderSourceId) {
    this.source = source;
    this.store = new SceneStore(source);
  }

  apply(patch: SceneSourceCommand): void {
    this.store.apply(patch);
  }

  project(
    frame: SceneLayerProjectionFrame,
    filter: TFilter,
  ): void {
    const view = this.store.view();
    this.view = view;
    this.projection.project(view, {
      ...frame,
      includes: (index) => this.includes(view, index, filter),
    });
  }

  draw(style: TStyle): void {
    const view = this.view;
    if (!view) return;
    for (const index of this.projection.visibleIndices()) {
      this.drawRecord(view, index, style);
    }
    style.context.globalAlpha = 1;
  }

  includesEntity(entityId: string, filter: TFilter): boolean {
    const view = this.view;
    if (!view) return false;
    const handle = this.store.handlesForEntityId(entityId)[0] ?? null;
    return (
      handle !== null &&
      this.includes(view, handle - 1, filter)
    );
  }

  nearest(
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): SceneHit | null {
    return this.projection.nearest(
      x,
      y,
      radius,
      maximumCandidates,
    );
  }

  selectionAnchor(entityId: string): SceneProjection | null {
    const view = this.view;
    if (!view) return null;
    for (const index of this.projection.visibleIndices()) {
      if (view.entityIds[index] === entityId) {
        return this.projection.projection(index);
      }
    }
    return null;
  }

  hasTimeAnimation(_reducedMotion: boolean): boolean {
    return false;
  }

  protected visibleIndices(): IterableIterator<number> {
    return this.projection.visibleIndices();
  }

  protected abstract includes(
    view: RenderSceneView,
    index: number,
    filter: TFilter,
  ): boolean;

  protected abstract drawRecord(
    view: RenderSceneView,
    index: number,
    style: TStyle,
  ): void;
}
