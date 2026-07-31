import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import type { RenderSourceId } from "@/workers/data/sourceIds";
import { pointTypeForSource } from "@/workers/data/sources/registry";
import {
  ProjectedSceneLayer,
  SceneHitKind,
  type SceneHit,
  type SceneProjection,
  type SceneProjectionFrame,
} from "@/workers/render/scene/projectedLayer";
import type {
  ScenePositionAccessor,
} from "@/workers/render/scene/scenePosition";
import {
  SceneDataCommandType,
  type SceneLayerCommand,
  type SceneSearchCommand,
} from "@/workers/render/sceneProtocol";
import {
  SceneStore,
  type RenderSceneRecord,
  type RenderSceneView,
} from "@/workers/render/sceneStore";
import type { RenderSelectionIdentity } from "@/workers/render/protocol";

export enum RenderLayerOrder {
  Aircraft = 0,
  Ships = 1,
  Fire = 2,
  Events = 3,
  Earthquake = 4,
  CycloneWarning = 5,
  Weather = 6,
  CycloneForecast = 7,
  Cyclones = 8,
}

export type SceneLayerProjectionFrame = Omit<
  SceneProjectionFrame,
  "includes"
>;

export type SceneLayerStyle = Readonly<{ context: Ctx }>;

export type RenderLayerSelectionTarget = Readonly<{
  identity: RenderSelectionIdentity;
  interpolated: boolean;
  latitude: number;
  longitude: number;
}>;

export interface RenderLayer {
  readonly order: RenderLayerOrder;
  readonly source: RenderSourceId;
  apply(command: SceneLayerCommand): void;
  hasFrameMotion(): boolean;
  hasTimeAnimation(reducedMotion: boolean): boolean;
  interactionIdentity(hit: SceneHit): RenderSelectionIdentity;
  nearest(
    kind: SceneHitKind,
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): SceneHit | null;
  searchIncludesEntity(entityId: string): boolean;
  selectionAnchor(entityId: string): SceneProjection | null;
  selectionTarget(
    id: string,
    time: number,
  ): RenderLayerSelectionTarget | null;
}

type RenderLayerPosition = Readonly<{
  interpolated: boolean;
  latitude: number;
  longitude: number;
}>;

export abstract class SceneLayer<TFilter> implements RenderLayer {
  abstract readonly order: RenderLayerOrder;
  readonly source: RenderSourceId;

  protected view: RenderSceneView | null = null;
  private readonly store: SceneStore;
  private searchHandles: ReadonlySet<number> | null = null;
  private searchRevision = 0;

  protected constructor(source: RenderSourceId) {
    this.source = source;
    this.store = new SceneStore(source);
  }

  abstract nearest(
    kind: SceneHitKind,
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): SceneHit | null;

  abstract selectionAnchor(entityId: string): SceneProjection | null;

  apply(command: SceneLayerCommand): void {
    if (command.type === SceneDataCommandType.SourcePatch) {
      this.store.apply(command);
      return;
    }
    this.applySearch(command);
  }

  includesEntity(entityId: string, filter: TFilter): boolean {
    const handle = this.store.handlesForEntityId(entityId)[0] ?? null;
    const view = this.view;
    return (
      handle !== null &&
      view !== null &&
      this.recordIncludes(view, handle - 1, filter)
    );
  }

  searchIncludesEntity(entityId: string): boolean {
    if (this.searchHandles === null) return true;
    return this.store.handlesForEntityId(entityId).some(
      (handle) => this.searchHandles?.has(handle) === true,
    );
  }

  hasTimeAnimation(_reducedMotion: boolean): boolean {
    return false;
  }

  hasFrameMotion(): boolean {
    return false;
  }

  interactionIdentity(hit: SceneHit): RenderSelectionIdentity {
    return {
      source: this.source,
      entityId: hit.entityId,
      interactionId: hit.entityId,
      pointType: pointTypeForSource(this.source),
    };
  }

  selectionTarget(
    id: string,
    time: number,
  ): RenderLayerSelectionTarget | null {
    const handle =
      this.store.handleForSceneId(id) ??
      this.store.handlesForEntityId(id)[0] ??
      null;
    if (handle === null) return null;
    const record = this.store.read(handle);
    if (!record) return null;
    return this.targetForRecord(record, time);
  }

  protected beginProject(): RenderSceneView {
    const view = this.store.view();
    this.view = view;
    return view;
  }

  protected recordIncludes(
    view: RenderSceneView,
    index: number,
    filter: TFilter,
  ): boolean {
    return (
      this.searchIncludes(index) &&
      this.includes(view, index, filter)
    );
  }

  protected abstract includes(
    view: RenderSceneView,
    index: number,
    filter: TFilter,
  ): boolean;

  protected positionForRecord(
    record: RenderSceneRecord,
    _time: number,
  ): RenderLayerPosition {
    return {
      interpolated: false,
      latitude: record.latitude,
      longitude: record.longitude,
    };
  }

  protected recordSelectionIdentity(
    record: RenderSceneRecord,
  ): RenderSelectionIdentity {
    return {
      source: this.source,
      entityId: record.entityId,
      interactionId: record.entityId,
      pointType: pointTypeForSource(this.source),
    };
  }

  private applySearch(command: SceneSearchCommand): void {
    if (command.searchRevision < this.searchRevision) return;
    this.searchRevision = command.searchRevision;
    this.searchHandles = command.active
      ? new Set(command.handles)
      : null;
  }

  private searchIncludes(index: number): boolean {
    return (
      this.searchHandles === null ||
      this.searchHandles.has(index + 1)
    );
  }

  private targetForRecord(
    record: RenderSceneRecord,
    time: number,
  ): RenderLayerSelectionTarget {
    const position = this.positionForRecord(record, time);
    return {
      identity: this.recordSelectionIdentity(record),
      ...position,
    };
  }
}

export abstract class ScenePointLayer<
  TFilter,
  TStyle extends SceneLayerStyle,
> extends SceneLayer<TFilter> {
  protected readonly projection: ProjectedSceneLayer;

  protected constructor(
    source: RenderSourceId,
    positionAccessor: ScenePositionAccessor | null = null,
  ) {
    super(source);
    this.projection = new ProjectedSceneLayer(positionAccessor);
  }

  project(
    frame: SceneLayerProjectionFrame,
    filter: TFilter,
    time: number = Date.now(),
  ): void {
    const view = this.beginProject();
    this.projection.project(view, {
      ...frame,
      includes: (index) =>
        this.recordIncludes(view, index, filter),
    }, time);
  }

  draw(style: TStyle): void {
    const view = this.view;
    if (!view) return;
    for (const index of this.projection.visibleIndices()) {
      this.drawRecord(view, index, style);
    }
    style.context.globalAlpha = 1;
  }

  nearest(
    kind: SceneHitKind,
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): SceneHit | null {
    if (kind !== SceneHitKind.Point) return null;
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

  protected visibleIndices(): IterableIterator<number> {
    return this.projection.visibleIndices();
  }

  override hasFrameMotion(): boolean {
    return this.view
      ? this.projection.hasFrameMotion(this.view)
      : false;
  }

  protected override positionForRecord(
    record: RenderSceneRecord,
    time: number,
  ): RenderLayerPosition {
    const position = this.projection.positionForRecord(record, time);
    return {
      interpolated: position.interpolated,
      latitude: position.latitude,
      longitude: position.longitude,
    };
  }

  protected abstract override includes(
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
