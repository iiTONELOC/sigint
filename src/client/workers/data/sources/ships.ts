import { parsePointList } from "@/features/base/pointCodec";
import {
  isShipPoint,
  SHIP_NUMBER_FIELDS,
  SHIP_STRING_FIELDS,
  type ShipPoint,
} from "@/features/tracking/ships/data/codec";
import {
  fetchShipSnapshot,
  type ShipFetchSnapshot,
} from "@/features/tracking/ships/data/fetch";
import { SHIP_UI_QUERIES } from "@/features/tracking/ships/data/uiQueries";
import {
  SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  ScenePatchCodec,
  sceneTimestamp,
  singleSceneRecord,
} from "@/workers/data/render-codecs/sceneCodec";
import {
  EntityLifetime,
  GeoCarrier,
  GeoDataSource,
  GeoMotion,
  type SourcePatchObserver,
  type SourcePolicy,
} from "@/workers/data/source-model/dataSource";
import { recordPosition } from "@/workers/data/source-model/position";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import {
  ShipSceneAttribute,
  ShipSceneSchema,
} from "@/workers/render/scene/shipSchema";
import { Domain } from "@shared/domain/identity";

export const SHIP_SOURCE = getPointSourceDefinition(Domain.Ships);

export type ShipSourceOptions = Readonly<{
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<ShipPoint>>;
  patchObservers?: readonly SourcePatchObserver<ShipPoint>[];
}>;

export function parseShipCache(
  value: unknown,
): readonly ShipPoint[] | null {
  return parsePointList(value, isShipPoint);
}

function shipChanged(
  previous: ShipPoint,
  next: ShipPoint,
): boolean {
  return (
    previous.lat !== next.lat ||
    previous.lon !== next.lon ||
    previous.timestamp !== next.timestamp ||
    SHIP_STRING_FIELDS.some(
      (key) => previous.data[key] !== next.data[key],
    ) ||
    SHIP_NUMBER_FIELDS.some(
      (key) => previous.data[key] !== next.data[key],
    )
  );
}

function normalizeSnapshot(
  snapshot: ShipFetchSnapshot,
): PointSourceFetchSnapshot<ShipPoint> {
  return snapshot;
}

async function fetchLiveShips(): Promise<
  PointSourceFetchSnapshot<ShipPoint>
> {
  return normalizeSnapshot(await fetchShipSnapshot());
}

export class ShipSource extends GeoDataSource<ShipPoint> {
  readonly policy: SourcePolicy = SHIP_SOURCE;
  readonly carrier = GeoCarrier.Position;
  readonly motion = GeoMotion.Moving;
  readonly lifetime = EntityLifetime.Ephemeral;
  readonly pointType = Domain.Ships;
  readonly queries = SHIP_UI_QUERIES;

  private readonly fetchOverride:
    | (() => Promise<PointSourceFetchSnapshot<ShipPoint>>)
    | null;

  constructor(options: ShipSourceOptions = {}) {
    super(options.patchObservers);
    this.fetchOverride = options.fetchSnapshot ?? null;
  }

  protected parseCache(value: unknown): readonly ShipPoint[] | null {
    return parseShipCache(value);
  }

  protected fetchSnapshot(): Promise<PointSourceFetchSnapshot<ShipPoint>> {
    return this.fetchOverride?.() ?? fetchLiveShips();
  }

  protected hasChanged(
    previous: ShipPoint,
    next: ShipPoint,
  ): boolean {
    return shipChanged(previous, next);
  }
}

export class ShipSceneBinding extends SceneBinding<ShipPoint> {
  constructor(publishScene: SceneCommandPublisher) {
    super(
      new ScenePatchCodec<ShipPoint>({
        source: Domain.Ships,
        attributeStride: ShipSceneSchema.AttributeStride,
        stringAttributeStride: ShipSceneSchema.StringAttributeStride,
        records: singleSceneRecord,
        position: recordPosition,
        timestamp: sceneTimestamp,
        writeAttributes: (point, target, offset) => {
          target[offset + ShipSceneAttribute.Heading] =
            point.data.heading ?? 0;
        },
      }),
      publishScene,
    );
  }
}
