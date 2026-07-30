import type { RenderSourceId } from "@/workers/data/sourceIds";
import type {
  SceneHit,
  SceneHitKind,
  SceneProjection,
} from "@/workers/render/scene/projectedLayer";
import type {
  RenderLayer,
  RenderLayerSelectionTarget,
} from "@/workers/render/scene/sceneLayer";
import type { SceneLayerCommand } from "@/workers/render/sceneProtocol";
import type {
  RenderSelectionIdentity,
} from "@/workers/render/protocol";

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

export class RenderLayerCatalog {
  private readonly bySource = new Map<RenderSourceId, RenderLayer>();
  private ordered: RenderLayer[] = [];

  register(layer: RenderLayer): void {
    if (this.bySource.has(layer.source)) {
      throw new RenderLayerCatalogError(
        RenderLayerCatalogErrorKind.DuplicateSource,
        layer.source,
      );
    }
    this.bySource.set(layer.source, layer);
    this.ordered = Array.from(this.bySource.values()).sort(
      (left, right) => left.order - right.order,
    );
  }

  apply(command: SceneLayerCommand): boolean {
    const layer = this.bySource.get(command.source);
    if (!layer) return false;
    layer.apply(command);
    return true;
  }

  nearest(
    kind: SceneHitKind,
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): RenderLayerHit | null {
    let closest: RenderLayerHit | null = null;
    for (const layer of this.ordered) {
      const hit = layer.nearest(
        kind,
        x,
        y,
        radius,
        maximumCandidates,
      );
      if (
        hit &&
        (!closest || hit.distance < closest.hit.distance)
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
    return this.bySource.get(source)?.selectionAnchor(entityId) ?? null;
  }

  selectionTarget(
    source: RenderSourceId,
    id: string,
  ): RenderLayerSelectionTarget | null {
    return this.bySource.get(source)?.selectionTarget(id) ?? null;
  }

  hasTimeAnimation(reducedMotion: boolean): boolean {
    return this.ordered.some((layer) =>
      layer.hasTimeAnimation(reducedMotion),
    );
  }
}
