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
  addDot,
  dotBatches,
  markerPulseIntensity,
  MarkerGlowPolicy,
  type DotBatchSet,
  type MarkerVisualRenderer,
  type PulsingMarker,
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
import {
  AggregateAttribute,
  AggregateCell,
  aggregatePoints,
  type PointAggregate,
} from "@/workers/render/scene/pointAggregate";
import { scenePositionFromView } from "@/workers/render/scene/scenePosition";
import { TurnDeg } from "@shared/geo";

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
  /** Below this zoom the layer draws one marker per 1 degree cell. */
  detailZoom?: number;
  includeThreshold?: boolean;
  markerPolicy: MarkerSourcePolicy;
  metricAttribute: number;
  normalizeMetric?: (metric: number) => number;
  order: RenderLayerOrder;
}>;

/** Aggregate markers grow with the log of the records they stand for,
 *  but never past a fraction of their cell on screen, so a dense region
 *  reads as density, not as one blob. */
enum AggregateMarker {
  CountGain = 0.3,
  MaximumScale = 2.5,
  MaximumCellFraction = 0.55,
  AlphaScale = 0.75,
}

const DEGREES_TO_RADIANS = Math.PI / TurnDeg.Half;

/** Screen pixels spanned by one degree at the frame's scale. */
function pixelsPerDegree(frame: SceneLayerProjectionFrame): number {
  if (frame.globe) return frame.globe.radius * DEGREES_TO_RADIANS;
  if (frame.flat) return frame.flat.mapWidth / TurnDeg.Full;
  return 1;
}

/** Age alpha moves through hour-scale buckets; a coarse clock is invisible. */
enum AgeAlphaRefresh {
  IntervalMs = 30_000,
}

const PULSING_POINT_LAYER_DEFINITIONS = {
  [Domain.Fire]: {
    detailZoom: 3,
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
      /** Glow only once records draw individually (past `detailZoom`). */
      pulseZoom: { floor: 3, span: 2.5 },
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

  /** The store's source version; projections and cell buckets key on it. */
  protected sceneVersion(): number {
    return this.store.version();
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
    if (!this.showsRecords(filter)) {
      this.projection.clear();
      return;
    }
    this.projection.project(view, {
      ...frame,
      includes: (index) =>
        this.recordIncludes(view, index, filter),
      sceneVersion: this.sceneVersion(),
    }, time);
  }

  /** A layer whose filter excludes every record skips projection entirely. */
  protected showsRecords(_filter: TFilter): boolean {
    return true;
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
  private aggregated = false;
  private aggregate: PointAggregate | null = null;
  private aggregateVersion = -1;
  private aggregateCellPixels = 1;
  private readonly aggregateProjection = new ProjectedSceneLayer();
  private zoomLevel = 1;
  private fadeColor = "";
  private readonly fades = new Map<number, string>();
  private styleVersion = -1;
  private sizes = new Float64Array(0);
  private glowOk = new Uint8Array(0);
  private alphas = new Float64Array(0);
  private alphaStamp = -1;
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
    this.animated = false;
    if (!filter.enabled) {
      this.beginProject();
      this.projection.clear();
      this.aggregateProjection.clear();
      this.aggregated = false;
      return;
    }
    const detailZoom = this.definition.detailZoom;
    this.aggregated =
      detailZoom !== undefined &&
      frame.zoomLevel !== undefined &&
      frame.zoomLevel < detailZoom &&
      filter.isolateMode === null;
    if (this.aggregated) {
      this.projectAggregate(frame, filter);
      return;
    }
    super.project(frame, filter);
    const view = this.view;
    if (!view) return;
    this.ensureRecordStyles(view);
    for (const index of this.visibleIndices()) {
      if (this.glowOk[index] !== 1) continue;
      this.animated = true;
      return;
    }
  }

  /** Sizes and glow eligibility are facts of the scene version, not the frame. */
  private ensureRecordStyles(view: RenderSceneView): void {
    const version = this.sceneVersion();
    if (version === this.styleVersion) return;
    this.styleVersion = version;
    this.alphaStamp = -1;
    const policy = this.definition.markerPolicy;
    if (this.sizes.length < view.capacity) {
      this.sizes = new Float64Array(view.capacity);
      this.glowOk = new Uint8Array(view.capacity);
      this.alphas = new Float64Array(view.capacity);
    }
    this.glowOk.fill(0);
    for (let index = 0; index < view.capacity; index++) {
      if (view.active[index] !== 1) continue;
      const metric = pulsingPointMetric(view, index, this.definition);
      this.sizes[index] = sourceMarkerSize(metric, false, policy);
      if (passesMarkerThreshold(metric, this.definition)) {
        this.glowOk[index] = 1;
      }
    }
    this.capGlow(view);
  }

  /** The strongest records keep their glow, up to the drawImage budget. */
  private capGlow(view: RenderSceneView): void {
    const limit = MarkerGlowPolicy.MaximumGlowingMarkers;
    const metrics: number[] = [];
    for (let index = 0; index < view.capacity; index++) {
      if (this.glowOk[index] !== 1) continue;
      metrics.push(pulsingPointMetric(view, index, this.definition));
    }
    if (metrics.length <= limit) return;
    metrics.sort((first, second) => second - first);
    const floor = metrics[limit - 1] ?? 0;
    for (let index = 0; index < view.capacity; index++) {
      if (
        this.glowOk[index] === 1 &&
        pulsingPointMetric(view, index, this.definition) < floor
      ) {
        this.glowOk[index] = 0;
      }
    }
  }

  /** Age alpha steps through hour-scale buckets on the coarse clock. */
  private ensureAgeAlphas(view: RenderSceneView, now: number): void {
    const stamp = Math.floor(now / AgeAlphaRefresh.IntervalMs);
    if (stamp === this.alphaStamp) return;
    this.alphaStamp = stamp;
    const policy = this.definition.markerPolicy;
    for (let index = 0; index < view.capacity; index++) {
      if (view.active[index] !== 1) continue;
      const timestamp = view.timestamps[index];
      this.alphas[index] = timestamp === undefined
        ? Number.NaN
        : sourceMarkerAgeAlpha(timestamp, now, policy);
    }
  }

  /** Low zoom: project the 1 degree cells instead of the records. */
  private projectAggregate(
    frame: SceneLayerProjectionFrame,
    filter: EnabledSceneFilter,
  ): void {
    const view = this.beginProject();
    const version = this.sceneVersion();
    if (!this.aggregate || this.aggregateVersion !== version) {
      this.aggregate = aggregatePoints(view, (index) =>
        pulsingPointMetric(view, index, this.definition),
      );
      this.aggregateVersion = version;
    }
    this.aggregateProjection.project(this.aggregate.view, {
      ...frame,
      includes: () => filter.enabled,
      sceneVersion: version,
    });
    this.aggregateCellPixels = pixelsPerDegree(frame) * AggregateCell.SizeDegrees;
  }

  /** Frames are only worth requesting while the pulse is visible at this zoom. */
  override hasTimeAnimation(reducedMotion: boolean): boolean {
    return !reducedMotion && this.animated && this.glowIntensity() > 0;
  }

  override nearest(
    kind: SceneHitKind,
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): SceneHit | null {
    if (!this.aggregated) return super.nearest(kind, x, y, radius, maximumCandidates);
    if (kind !== SceneHitKind.Point) return null;
    const hit = this.aggregateProjection.nearest(x, y, radius, maximumCandidates);
    return hit ? this.peakRecordHit(hit) : null;
  }

  /** A cell hit resolves to the strongest record in that cell. */
  private peakRecordHit(hit: SceneHit): SceneHit | null {
    const view = this.view;
    const index = this.aggregate?.peakRecords[hit.handle - 1];
    if (!view || index === undefined) return null;
    const position = scenePositionFromView(view, index);
    const sceneId = view.sceneIds[index];
    const entityId = view.entityIds[index];
    if (!position || !sceneId || !entityId) return null;
    return {
      ...hit,
      handle: index + 1,
      sceneId,
      entityId,
      latitude: position.latitude,
      longitude: position.longitude,
    };
  }

  override selectionAnchor(entityId: string): SceneProjection | null {
    if (!this.aggregated) return super.selectionAnchor(entityId);
    const cell = this.aggregate?.cellOfEntity.get(entityId);
    return cell === undefined ? null : this.aggregateProjection.projection(cell);
  }

  /** Batched: every dot fills once per colour, size, and alpha bucket;
   *  glow sprites draw beneath the batches and only the selected marker
   *  keeps its own draw. */
  override draw(style: PulsingPointSceneStyle): void {
    const view = this.view;
    if (!view) return;
    this.zoomLevel = style.zoomLevel;
    if (this.fadeColor !== style.color) {
      this.fadeColor = style.color;
      this.fades.clear();
    }
    const batches: DotBatchSet = new Map();
    const indices = this.aggregated
      ? this.aggregateProjection.visibleIndices()
      : this.visibleIndices();
    const intensity = this.glowIntensity();
    if (!this.aggregated) {
      this.ensureRecordStyles(view);
      this.ensureAgeAlphas(view, style.now);
    }
    for (const index of indices) {
      const marker = this.aggregated
        ? this.aggregateMarkerAt(index, style)
        : this.markerAt(view, index, style, intensity);
      if (!marker) continue;
      if (marker.selected) {
        this.visuals.drawPulsing(style.context, style.time, marker);
        continue;
      }
      if (marker.glow) {
        this.visuals.drawPulseGlow(
          style.context,
          style.time,
          marker,
          marker.glow,
        );
      }
      addDot(batches, marker);
    }
    for (const batch of dotBatches(batches)) {
      this.visuals.fillDots(style.context, batch);
    }
    style.context.globalAlpha = 1;
  }

  /** Age alpha takes a handful of values; fade each once per colour. */
  private fadedColor(color: string, alpha: number): string {
    let faded = this.fades.get(alpha);
    if (faded === undefined) {
      faded = this.visuals.fade(color, alpha);
      this.fades.set(alpha, faded);
    }
    return faded;
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
    this.ensureRecordStyles(view);
    this.ensureAgeAlphas(view, style.now);
    const marker = this.markerAt(view, index, style, this.glowIntensity());
    if (marker) this.visuals.drawPulsing(style.context, style.time, marker);
  }

  /** One marker for a cell: sized by its peak metric and record count. */
  private aggregateMarkerAt(
    index: number,
    style: PulsingPointSceneStyle,
  ): PulsingMarker | null {
    const aggregate = this.aggregate;
    const projection = this.aggregateProjection.projection(index);
    if (!aggregate || !projection) return null;
    const view = aggregate.view;
    const policy = this.definition.markerPolicy;
    const peak = sceneNumericAttribute(view, index, AggregateAttribute.PeakMetric);
    const count = sceneNumericAttribute(view, index, AggregateAttribute.Count);
    const alpha = sourceMarkerAgeAlpha(view.timestamps[index] ?? 0, style.now, policy);
    const scale = Math.min(
      AggregateMarker.MaximumScale,
      1 + Math.log2(Math.max(1, count)) * AggregateMarker.CountGain,
    );
    const selected =
      style.selectedId !== null &&
      aggregate.cellOfEntity.get(style.selectedId) === index;
    return {
      x: projection.x,
      y: projection.y,
      size: Math.min(
        sourceMarkerSize(peak, false, policy) * zoomScale(style.zoomLevel) * scale,
        this.aggregateCellPixels * AggregateMarker.MaximumCellFraction,
      ),
      color: this.fadedColor(style.color, alpha),
      fillAlpha:
        sourceMarkerFillAlpha(projection.depth, alpha, policy) *
        AggregateMarker.AlphaScale,
      selected,
      glow: null,
    };
  }

  private glowIntensity(): number {
    const intensity = markerPulseIntensity(
      this.zoomLevel,
      this.definition.markerPolicy.pulseZoom,
    );
    return intensity > MarkerGlowPolicy.MinimumVisibleIntensity ? intensity : 0;
  }

  private markerAt(
    view: RenderSceneView,
    index: number,
    style: PulsingPointSceneStyle,
    intensity: number,
  ): PulsingMarker | null {
    const projection = this.projection.projection(index);
    const entityId = view.entityIds[index];
    const alpha = this.alphas[index] ?? Number.NaN;
    if (!projection || !entityId || Number.isNaN(alpha)) return null;

    const policy = this.definition.markerPolicy;
    const selected = entityId === style.selectedId;
    const baseSize = this.sizes[index] ?? 0;
    return {
      x: projection.x,
      y: projection.y,
      size:
        (selected ? baseSize * policy.selectedScale : baseSize) *
        zoomScale(style.zoomLevel),
      color: this.fadedColor(style.color, alpha),
      fillAlpha: sourceMarkerFillAlpha(projection.depth, alpha, policy),
      selected,
      glow: intensity > 0 && this.glowOk[index] === 1
        ? {
            intensity,
            pulseIndex: sourceMarkerPulseIndex(
              pulsingPointMetric(view, index, this.definition),
              policy,
            ),
            id: entityId,
            config: policy.glow,
          }
        : null,
    };
  }
}
