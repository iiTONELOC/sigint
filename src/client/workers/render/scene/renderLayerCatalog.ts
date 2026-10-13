import { PulsingPointLayer } from "@/workers/render/scene/pulsingPointLayer";
import type { RenderWorkerColors } from "@shared/domain/theme";
import { ThemeColorKey } from "@shared/domain/theme";
import { Domain } from "@shared/domain/identity";
import type { RenderSourceId } from "@shared/source";
import type { GeoMultiPolygon } from "@shared/geo";
import type { ProjFn } from "@/lib/geo/render/types";
import type { MarkerVisualRenderer } from "@/workers/render/primitives/markerVisuals";
import type { RenderGlobeStateSnapshot, RenderSelectionIdentity } from "@/workers/render/protocol";
import { AircraftLayer } from "@/workers/render/scene/aircraftLayer";
import type { SceneAreaProjectionFrame } from "@/workers/render/scene/areaLayer";
import { CycloneLayer } from "@/workers/render/scene/cycloneLayer";
import {
  CycloneWarningLayer,
  type CycloneWarningSceneStyle,
} from "@/workers/render/scene/cycloneWarningLayer";
import type { SceneHit, SceneHitKind, SceneProjection } from "@/workers/render/scene/projectedLayer";
import {
  type RenderLayer,
  type RenderLayerSelectionTarget,
} from "@/workers/render/scene/sceneLayer";
import { ShipLayer } from "@/workers/render/scene/shipLayer";
import type { EnabledSceneFilter, SceneVisibilitySettings } from "@/workers/render/scene/visibility";
import { WeatherLayer } from "@/workers/render/scene/weatherLayer";
import type { SceneLayerCommand } from "@/workers/render/sceneProtocol";
import {
  RenderBackdrop,
  type RenderBackdropOptions,
} from "@/workers/render/scene/renderBackdrop";
export enum RenderLayerCatalogErrorKind {
  DuplicateSource = "The render layer source is already registered",
}

export class RenderLayerCatalogError extends Error {
  readonly kind: RenderLayerCatalogErrorKind;
  readonly source: RenderSourceId;

  constructor(
    kind: RenderLayerCatalogErrorKind,
    source: RenderSourceId,
  ) {
    super(kind);
    this.name = RenderLayerCatalogError.name;
    this.kind = kind;
    this.source = source;
  }
}

export type RenderLayerHit = Readonly<{
  hit: SceneHit;
  identity: RenderSelectionIdentity;
}>;

export type RenderLayerProjectOptions = Readonly<{
  globeState: RenderGlobeStateSnapshot;
  selection: RenderSelectionIdentity | null;
  time: number;
}>;

export type RenderLayerProjectedFrame = Readonly<{
  aircraftEntityIsVisible: (entityId: string) => boolean;
  isolatedType: RenderSelectionIdentity["pointType"] | null;
}>;

export type RenderLayerAreaOptions = CycloneWarningSceneStyle & Readonly<{ reducedMotion: boolean }>;

export type RenderLayerDrawOptions = Readonly<{
  colors: RenderWorkerColors;
  context: OffscreenCanvasRenderingContext2D;
  reducedMotion: boolean;
  selectedId: string | null;
  time: number;
  wallTime: number;
}>;

function createRenderSceneLayers(visuals: MarkerVisualRenderer) {
  return {
    [Domain.Aircraft]: new AircraftLayer(),
    [Domain.Ships]: new ShipLayer(),
    [Domain.Fire]: new PulsingPointLayer(Domain.Fire, visuals),
    [Domain.Events]: new PulsingPointLayer(Domain.Events, visuals),
    [Domain.Earthquake]: new PulsingPointLayer(
      Domain.Earthquake,
      visuals,
    ),
    [Domain.CycloneWarnings]: new CycloneWarningLayer(),
    [Domain.Weather]: new WeatherLayer(visuals),
    [Domain.Cyclones]: new CycloneLayer(),
  } satisfies Readonly<Partial<Record<RenderSourceId, RenderLayer>>>;
}

type RenderSceneLayers = ReturnType<typeof createRenderSceneLayers>;

function enabledFilter(
  enabled: boolean,
  visibility: SceneVisibilitySettings,
): EnabledSceneFilter {
  return { enabled, ...visibility };
}

export class RenderLayerCatalog {
  private readonly backdrop = new RenderBackdrop();
  private readonly bySource: Partial<Record<RenderSourceId, RenderLayer>> = {};
  private nextStateRevision = 1;
  private ordered: RenderLayer[] | null = null;
  private readonly sceneLayers: RenderSceneLayers | null = null;
  private readonly stateRevisions = new WeakMap<RenderGlobeStateSnapshot, number>();

  constructor(visuals?: MarkerVisualRenderer) {
    if (!visuals) return;
    const layers = createRenderSceneLayers(visuals);
    Object.assign(this.bySource, layers);
    this.sceneLayers = layers;
  }

  register(layer: RenderLayer): void {
    if (this.bySource[layer.source]) {
      throw new RenderLayerCatalogError(
        RenderLayerCatalogErrorKind.DuplicateSource,
        layer.source,
      );
    }
    this.bySource[layer.source] = layer;
    this.ordered = null;
  }

  apply(command: SceneLayerCommand): boolean {
    const layer = this.bySource[command.source];
    if (!layer) return false;
    layer.apply(command);
    return true;
  }

  setLand(polygons: GeoMultiPolygon): void {
    this.backdrop.setLand(polygons);
  }

  drawBackdrop(options: RenderBackdropOptions): ProjFn {
    return this.backdrop.draw(options);
  }

  drawFrameEdge(): void {
    this.backdrop.drawEdge();
  }

  project(options: RenderLayerProjectOptions): RenderLayerProjectedFrame {
    const layers = this.sceneLayers;
    const cameraFrame = this.backdrop.projectionFrame();
    if (!layers || !cameraFrame) {
      return {
        aircraftEntityIsVisible: () => false,
        isolatedType: null,
      };
    }
    const state = options.globeState;
    const isolateMode = state.isolateMode;
    const isolatedId = isolateMode === null
      ? null
      : options.selection?.interactionId ?? null;
    const isolatedType =
      isolatedId && options.selection?.interactionId === isolatedId
        ? options.selection.pointType
        : null;
    const visibility: SceneVisibilitySettings = {
      isolateMode,
      isolatedId,
      isolatedType,
    };
    // Every layer filter derives from the globe state and the isolation
    // target, so their identity completes the projection revision.
    const frame: SceneAreaProjectionFrame = {
      ...cameraFrame,
      revision: [
        cameraFrame.revision,
        this.stateRevision(state),
        isolatedId ?? "",
        isolatedType ?? "",
      ].join("|"),
    };
    const aircraftFilter = {
      filter: state.aircraftFilter,
      ...visibility,
    };

    layers[Domain.Aircraft].project(
      frame,
      aircraftFilter,
      options.time,
    );
    layers[Domain.Ships].project(
      frame,
      enabledFilter(state.layers[Domain.Ships], visibility),
      options.time,
    );
    layers[Domain.Fire].project(
      frame,
      enabledFilter(state.layers[Domain.Fires], visibility),
    );
    layers[Domain.Events].project(
      frame,
      enabledFilter(state.layers[Domain.Events], visibility),
    );
    layers[Domain.Earthquake].project(
      frame,
      enabledFilter(state.layers[Domain.Quakes], visibility),
    );
    layers[Domain.CycloneWarnings].project(
      frame,
      enabledFilter(state.cycloneFilter.showWarnings, visibility),
    );
    layers[Domain.Weather].project(
      frame,
      enabledFilter(state.layers[Domain.Weather], visibility),
    );
    layers[Domain.Cyclones].project(frame, {
      enabled: state.layers[Domain.Cyclones],
      minCategory: state.cycloneFilter.minimumCategory,
      overlays: state.cycloneFilter.overlays,
      ...visibility,
    });

    return {
      isolatedType,
      aircraftEntityIsVisible: (entityId) =>
        layers[Domain.Aircraft].includesEntity(
          entityId,
          aircraftFilter,
        ),
    };
  }

  drawAreas(options: RenderLayerAreaOptions): void {
    const layers = this.sceneLayers;
    if (!layers) return;
    layers[Domain.CycloneWarnings].drawAreas(options);
    layers[Domain.Weather].drawAreas(options);
    const project = this.backdrop.projector();
    if (!project) return;
    layers[Domain.Cyclones].drawUnderlay({
      context: options.context,
      project,
      reducedMotion: options.reducedMotion,
      surgeColor: options.warningColor,
      strokeOverImagery: () => {
        this.backdrop.strokeCoastlines();
        layers[Domain.CycloneWarnings].strokeAreas(options);
        layers[Domain.Weather].strokeAreas(options);
      },
    });
  }

  draw(options: RenderLayerDrawOptions): void {
    const layers = this.sceneLayers;
    const project = this.backdrop.projector();
    if (!layers || !project) return;
    const selectedId = options.selectedId;
    const markerStyle = {
      context: options.context,
      selectedId,
      time: options.time,
      zoomLevel: this.backdrop.zoomLevel(),
    };
    layers[Domain.Aircraft].draw({
      ...markerStyle,
      baseColor: options.colors[ThemeColorKey.Aircraft],
      emergencyColor: options.colors[ThemeColorKey.AircraftEmergency],
      hijackColor: options.colors[ThemeColorKey.AircraftHijack],
      militaryColor: options.colors[ThemeColorKey.Military],
      radioFailureColor:
        options.colors[ThemeColorKey.AircraftRadioFailure],
      reconColor: options.colors[ThemeColorKey.Recon],
    });
    layers[Domain.Ships].draw({
      ...markerStyle,
      color: options.colors[ThemeColorKey.Ships],
    });
    layers[Domain.Fire].draw({
      ...markerStyle,
      color: options.colors[ThemeColorKey.Fires],
      now: options.wallTime,
    });
    layers[Domain.Events].draw({
      ...markerStyle,
      color: options.colors[ThemeColorKey.Events],
      now: options.wallTime,
    });
    layers[Domain.Earthquake].draw({
      ...markerStyle,
      color: options.colors[ThemeColorKey.Quakes],
      now: options.wallTime,
    });
    layers[Domain.Weather].draw({
      ...markerStyle,
      color: options.colors[ThemeColorKey.Weather],
    });
    layers[Domain.Cyclones].draw({
      color: options.colors[ThemeColorKey.Cyclones],
      surgeColor: options.colors[ThemeColorKey.CycloneWarning],
      casingColor: options.colors[ThemeColorKey.Background],
      context: options.context,
      project,
      reducedMotion: options.reducedMotion,
      selectedId,
      time: options.time,
    });
  }

  nearest(
    kind: SceneHitKind,
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): RenderLayerHit | null {
    let closest: RenderLayerHit | null = null;
    for (const layer of this.orderedLayers()) {
      const hit = layer.nearest(
        kind,
        x,
        y,
        radius,
        maximumCandidates,
      );
      if (
        hit &&
        (!closest || hit.distance <= closest.hit.distance)
      ) {
        closest = {
          hit,
          identity: layer.interactionIdentity(hit),
        };
      }
    }
    return closest;
  }

  selectionAnchor(
    source: RenderSourceId,
    entityId: string,
  ): SceneProjection | null {
    return this.bySource[source]?.selectionAnchor(entityId) ?? null;
  }

  searchIncludesEntity(
    source: RenderSourceId,
    entityId: string,
  ): boolean {
    return this.bySource[source]?.searchIncludesEntity(entityId) ?? false;
  }

  selectionTarget(
    source: RenderSourceId,
    id: string,
    time: number,
  ): RenderLayerSelectionTarget | null {
    return this.bySource[source]?.selectionTarget(id, time) ?? null;
  }

  hasFrameMotion(): boolean {
    return this.orderedLayers().some((layer) => layer.hasFrameMotion());
  }

  hasTimeAnimation(reducedMotion: boolean): boolean {
    return this.orderedLayers().some((layer) =>
      layer.hasTimeAnimation(reducedMotion),
    );
  }

  private orderedLayers(): RenderLayer[] {
    this.ordered ??= Object.values(this.bySource).sort(
      (left, right) => left.order - right.order,
    );
    return this.ordered;
  }

  /** The controller replaces the state object only on change; number each one. */
  private stateRevision(state: RenderGlobeStateSnapshot): number {
    let revision = this.stateRevisions.get(state);
    if (revision === undefined) {
      revision = this.nextStateRevision++;
      this.stateRevisions.set(state, revision);
    }
    return revision;
  }
}
