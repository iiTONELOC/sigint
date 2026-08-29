import {
  IntelSeverity,
  parseIntelSeverity,
} from "@shared/domain/correlation";
import { Domain } from "@shared/domain/identity";
import {
  getPointSourceDefinition,
} from "@shared/domain/pointSource";
import {
  EarthquakeSceneAttribute,
  EventSceneAttribute,
  FireSceneAttribute,
} from "@shared/scene";
import type { RenderSourceId } from "@shared/source";
import { MS_PER_DAY, MS_PER_HOUR } from "@shared/time";
import {
  MarkerAgeSpan,
  MarkerDepthAlpha,
  sourceMarkerAgeAlpha,
  sourceMarkerFillAlpha,
  sourceMarkerPulseIndex,
  sourceMarkerSize,
  type MarkerSourcePolicy,
} from "@/workers/render/primitives/markerStyle";
import {
  markerPulseIntensity,
  type MarkerVisualRenderer,
} from "@/workers/render/primitives/markerVisuals";
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
  sceneNumericAttribute,
  type RenderSceneRecord,
  type RenderSceneView,
} from "@/workers/render/sceneStore";
import type { RenderSelectionIdentity } from "@/workers/render/protocol";
import {
  sceneSourceIncludes,
  type EnabledSceneFilter,
} from "@/workers/render/scene/visibility";
import { zoomScale } from "@/workers/render/workerMath";

export enum RenderLayerOrder {
  Aircraft = 0,
  Ships = 1,
  Fire = 2,
  Events = 3,
  Earthquake = 4,
  CycloneWarning = 5,
  Weather = 6,
  Cyclones = 8,
}

type PulsingPointLayerDefinition = Readonly<{
  includeThreshold?: boolean;
  markerPolicy: MarkerSourcePolicy;
  metricAttribute: number;
  normalizeMetric?: (metric: number) => number;
  order: RenderLayerOrder;
}>;

const PULSING_POINT_LAYER_DEFINITIONS = {
  [Domain.Fire]: {
    markerPolicy: {
      ageAlphaByMaximumMs: {
        [MS_PER_HOUR]: 1,
        [3 * MS_PER_HOUR]: 0.9,
        [6 * MS_PER_HOUR]: 0.8,
        [MS_PER_DAY / 2]: 0.65,
      },
      agedAlpha: 0.5,
      animationThreshold: 15,
      glow: {
        idSliceFrom: 2,
        rate: 0.6,
        baseAmp: 0.05,
        ampGain: 0.15,
        radBase: 1.5,
        alphaHex: "30",
        glowMul: 0.35,
      },
      markerAlphaGain: 0.5,
      maximumSize: 4.5,
      pulseSpan: 85,
      pulseZoom: { floor: 1.5, span: 2.5 },
      selectedScale: 2,
      sizeByMaximum: {
        1: 0.8,
        5: 1,
        10: 1.3,
        25: 1.8,
        50: 2.5,
        100: 3.5,
      },
    },
    metricAttribute: FireSceneAttribute.RadiativePower,
    order: RenderLayerOrder.Fire,
  },
  [Domain.Events]: {
    markerPolicy: {
      ageAlphaByMaximumMs: {
        [MS_PER_HOUR]: 1,
        [MarkerAgeSpan.RecentHours * MS_PER_HOUR]: 0.9,
        [MS_PER_DAY]: 0.75,
        [MarkerAgeSpan.SeveralDays * MS_PER_DAY]: 0.6,
      },
      agedAlpha: 0.45,
      animationThreshold: IntelSeverity.Tension,
      glow: {
        idSliceFrom: 2,
        rate: 0.5,
        baseAmp: 0.1,
        ampGain: 0.2,
        radBase: 1.8,
        radGain: 1.2,
        alphaHex: "30",
        glowMul: 0.4,
      },
      markerAlphaGain: 0.75,
      maximumSize: 3.5,
      pulseBase: IntelSeverity.Concern,
      pulseSpan: 3,
      selectedScale: 2,
      sizeByMaximum: {
        [IntelSeverity.Concern]: 1,
        [IntelSeverity.Tension]: 1.3,
        [IntelSeverity.Conflict]: 1.8,
        [IntelSeverity.Crisis]: 2.5,
      },
    },
    includeThreshold: true,
    metricAttribute: EventSceneAttribute.Severity,
    normalizeMetric: parseIntelSeverity,
    order: RenderLayerOrder.Events,
  },
  [Domain.Earthquake]: {
    markerPolicy: {
      ageAlphaByMaximumMs: {
        [MS_PER_HOUR]: 1,
        [MarkerAgeSpan.RecentHours * MS_PER_HOUR]: 0.9,
        [MS_PER_DAY]: 0.8,
        [MarkerAgeSpan.SeveralDays * MS_PER_DAY]: 0.65,
      },
      agedAlpha: 0.5,
      animationThreshold: 3,
      glow: {
        idSliceFrom: 1,
        rate: 0.7,
        baseAmp: 0.1,
        ampGain: 0.2,
        radBase: 1.8,
        radGain: 1.5,
        alphaHex: "40",
        glowMul: 0.5,
      },
      markerAlphaGain: MarkerDepthAlpha.StandardGain,
      maximumSize: 10,
      pulseSpan: 4,
      selectedScale: 2,
      sizeByMaximum: {
        1: 1.2,
        2: 1.5,
        3: 2,
        4: 3,
        5: 4.5,
        6: 6,
        7: 8,
      },
    },
    metricAttribute: EarthquakeSceneAttribute.Magnitude,
    order: RenderLayerOrder.Earthquake,
  },
} satisfies Readonly<
  Partial<Record<RenderSourceId, PulsingPointLayerDefinition>>
>;

export type PulsingPointLayerSource =
  keyof typeof PULSING_POINT_LAYER_DEFINITIONS;

export type PulsingPointSceneStyle = Readonly<{
  color: string;
  context: OffscreenCanvasRenderingContext2D;
  now: number;
  selectedId: string | null;
  time: number;
  zoomLevel: number;
}>;

export type SceneLayerProjectionFrame = Omit<
  SceneProjectionFrame,
  "includes"
>;

export type SceneLayerStyle = Readonly<{
  context: OffscreenCanvasRenderingContext2D;
}>;

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
      pointType: getPointSourceDefinition(this.source).pointType,
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
      pointType: getPointSourceDefinition(this.source).pointType,
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

function pulsingPointDefinition(
  source: PulsingPointLayerSource,
): PulsingPointLayerDefinition {
  return PULSING_POINT_LAYER_DEFINITIONS[source];
}

function pulsingPointMetric(
  view: RenderSceneView,
  index: number,
  definition: PulsingPointLayerDefinition,
): number {
  const metric = sceneNumericAttribute(
    view,
    index,
    definition.metricAttribute,
  );
  return definition.normalizeMetric?.(metric) ?? metric;
}

function passesMarkerThreshold(
  metric: number,
  definition: PulsingPointLayerDefinition,
): boolean {
  return definition.includeThreshold === true
    ? metric >= definition.markerPolicy.animationThreshold
    : metric > definition.markerPolicy.animationThreshold;
}

export class PulsingPointLayer extends ScenePointLayer<
  EnabledSceneFilter,
  PulsingPointSceneStyle
> {
  readonly order: RenderLayerOrder;

  private animated = false;
  private readonly definition: PulsingPointLayerDefinition;
  private readonly pulsingSource: PulsingPointLayerSource;
  private readonly visuals: MarkerVisualRenderer;

  constructor(
    source: PulsingPointLayerSource,
    visuals: MarkerVisualRenderer,
  ) {
    super(source);
    this.definition = pulsingPointDefinition(source);
    this.order = this.definition.order;
    this.pulsingSource = source;
    this.visuals = visuals;
  }

  override project(
    frame: SceneLayerProjectionFrame,
    filter: EnabledSceneFilter,
  ): void {
    super.project(frame, filter);
    const view = this.view;
    this.animated = false;
    if (!view) return;
    for (const index of this.visibleIndices()) {
      const metric = pulsingPointMetric(
        view,
        index,
        this.definition,
      );
      if (!passesMarkerThreshold(metric, this.definition)) continue;
      this.animated = true;
      return;
    }
  }

  override hasTimeAnimation(reducedMotion: boolean): boolean {
    return !reducedMotion && this.animated;
  }

  protected includes(
    view: RenderSceneView,
    index: number,
    filter: EnabledSceneFilter,
  ): boolean {
    return sceneSourceIncludes(this.pulsingSource, view, index, filter);
  }

  protected drawRecord(
    view: RenderSceneView,
    index: number,
    style: PulsingPointSceneStyle,
  ): void {
    const projection = this.projection.projection(index);
    const entityId = view.entityIds[index];
    const timestamp = view.timestamps[index];
    if (!projection || !entityId || timestamp === undefined) return;

    const policy = this.definition.markerPolicy;
    const metric = pulsingPointMetric(view, index, this.definition);
    const alpha = sourceMarkerAgeAlpha(timestamp, style.now, policy);
    const selected = entityId === style.selectedId;
    const size =
      sourceMarkerSize(metric, selected, policy) *
      zoomScale(style.zoomLevel);
    const color = this.visuals.fade(style.color, alpha);
    this.visuals.drawPulsing(style.context, style.time, {
      x: projection.x,
      y: projection.y,
      size,
      color,
      fillAlpha: sourceMarkerFillAlpha(
        projection.depth,
        alpha,
        policy,
      ),
      selected,
      glow: passesMarkerThreshold(metric, this.definition)
        ? {
            intensity: markerPulseIntensity(
              style.zoomLevel,
              policy.pulseZoom,
            ),
            pulseIndex: sourceMarkerPulseIndex(metric, policy),
            id: entityId,
            config: policy.glow,
          }
        : null,
    });
  }
}
