import { describe, expect, test } from "bun:test";
import {
  RenderLayerCatalog,
  RenderLayerCatalogError,
  RenderLayerCatalogErrorKind,
} from "@/workers/render/scene/renderLayerCatalog";
import {
  RenderFocusResolver,
} from "@/workers/render/focusResolver";
import {
  RenderLayerOrder,
  type RenderLayer,
  type RenderLayerSelectionTarget,
} from "@/workers/render/scene/sceneLayer";
import type {
  SceneHit,
  SceneProjection,
} from "@/workers/render/scene/projectedLayer";
import { SceneHitKind } from "@/workers/render/scene/projectedLayer";
import type { SceneLayerCommand } from "@/workers/render/sceneProtocol";
import { Domain } from "@shared/domain/identity";
import { sceneRebaseCommand } from "../_support/scene";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { RenderFocusKind } from "@/workers/render/protocol";

class ProbeLayer implements RenderLayer {
  readonly order: RenderLayerOrder;
  readonly source: Domain.Aircraft | Domain.Ships;
  applied = 0;

  constructor(
    source: Domain.Aircraft | Domain.Ships,
    order: RenderLayerOrder,
  ) {
    this.source = source;
    this.order = order;
  }

  apply(_command: SceneLayerCommand): void {
    this.applied += 1;
  }

  hasTimeAnimation(_reducedMotion: boolean): boolean {
    return false;
  }

  interactionIdentity(hit: SceneHit) {
    return {
      source: this.source,
      entityId: hit.entityId,
      interactionId: hit.entityId,
      pointType: this.source,
    };
  }

  nearest(kind: SceneHitKind): SceneHit {
    return {
      kind,
      handle: 1,
      sceneId: this.source,
      entityId: this.source,
      longitude: 0,
      latitude: 0,
      distance: 1,
    };
  }

  searchIncludesEntity(entityId: string): boolean {
    return entityId === this.source;
  }

  selectionAnchor(entityId: string): SceneProjection | null {
    return entityId === this.source
      ? { x: 1, y: 2, depth: 1 }
      : null;
  }

  selectionTarget(id: string): RenderLayerSelectionTarget | null {
    if (id !== this.source) return null;
    return {
      identity: {
        source: this.source,
        entityId: id,
        interactionId: id,
        pointType: this.source,
      },
      latitude: 0,
      longitude: 0,
    };
  }
}

const EMPTY_VIEW = {
  capacity: 0,
  active: new Uint8Array(),
  sceneIds: [],
  entityIds: [],
  positions: new Float64Array(),
  unitVectors: new Float32Array(),
  timestamps: new Float64Array(),
  attributes: new Float32Array(),
  attributeStride: 0,
  stringAttributes: new Uint32Array(),
  stringAttributeStride: 0,
  dictionary: [],
  geometries: [],
} satisfies RenderSceneView;

describe("RenderLayerCatalog", () => {
  test("owns patch dispatch, order, hit testing, and selection", () => {
    const ships = new ProbeLayer(
      Domain.Ships,
      RenderLayerOrder.Ships,
    );
    const aircraft = new ProbeLayer(
      Domain.Aircraft,
      RenderLayerOrder.Aircraft,
    );
    const catalog = new RenderLayerCatalog();
    catalog.register(ships);
    catalog.register(aircraft);

    expect(
      catalog.apply(sceneRebaseCommand(Domain.Aircraft, EMPTY_VIEW)),
    ).toBe(true);
    expect(aircraft.applied).toBe(1);
    expect(ships.applied).toBe(0);
    expect(
      catalog.nearest(SceneHitKind.Point, 0, 0, 10, 10)
        ?.identity.source,
    ).toBe(
      Domain.Aircraft,
    );
    expect(
      catalog.selectionAnchor(Domain.Ships, Domain.Ships),
    ).toEqual({
      x: 1,
      y: 2,
      depth: 1,
    });
    expect(
      catalog.selectionAnchor(Domain.Aircraft, Domain.Ships),
    ).toBeNull();
    expect(
      catalog.searchIncludesEntity(Domain.Ships, Domain.Ships),
    ).toBe(true);
    expect(
      catalog.selectionTarget(Domain.Ships, Domain.Ships),
    ).toEqual({
      identity: {
        source: Domain.Ships,
        entityId: Domain.Ships,
        interactionId: Domain.Ships,
        pointType: Domain.Ships,
      },
      latitude: 0,
      longitude: 0,
    });
  });

  test("rejects duplicate layer sources", () => {
    const layer = new ProbeLayer(
      Domain.Aircraft,
      RenderLayerOrder.Aircraft,
    );
    const catalog = new RenderLayerCatalog();
    catalog.register(layer);

    expect(() => {
      catalog.register(layer);
    }).toThrow(
      new RenderLayerCatalogError(
        RenderLayerCatalogErrorKind.DuplicateSource,
        Domain.Aircraft,
      ),
    );
  });
});

describe("RenderFocusResolver", () => {
  test("resolves an identity from the worker scene catalog", () => {
    const catalog = new RenderLayerCatalog();
    catalog.register(
      new ProbeLayer(Domain.Ships, RenderLayerOrder.Ships),
    );
    const resolver = new RenderFocusResolver(catalog);

    expect(
      resolver.resolve(
        {
          source: Domain.Ships,
          entityId: Domain.Ships,
          kind: RenderFocusKind.Focus,
        },
        null,
        null,
      ),
    ).toEqual({
      id: Domain.Ships,
      latitude: 0,
      longitude: 0,
    });
  });

  test("prefers the live position for the selected identity", () => {
    const catalog = new RenderLayerCatalog();
    catalog.register(
      new ProbeLayer(Domain.Aircraft, RenderLayerOrder.Aircraft),
    );
    const resolver = new RenderFocusResolver(catalog);
    const selectedPosition = {
      id: Domain.Aircraft,
      latitude: 10,
      longitude: 20,
    };

    expect(
      resolver.resolve(
        {
          source: Domain.Aircraft,
          entityId: Domain.Aircraft,
          kind: RenderFocusKind.Reveal,
        },
        {
          source: Domain.Aircraft,
          entityId: Domain.Aircraft,
          interactionId: Domain.Aircraft,
          pointType: Domain.Aircraft,
        },
        selectedPosition,
      ),
    ).toBe(selectedPosition);
  });

  test("rejects an identity absent from the worker scene", () => {
    const resolver = new RenderFocusResolver(
      new RenderLayerCatalog(),
    );

    expect(
      resolver.resolve(
        {
          source: Domain.Events,
          entityId: Domain.Events,
          kind: RenderFocusKind.Focus,
        },
        null,
        null,
      ),
    ).toBeNull();
  });
});
