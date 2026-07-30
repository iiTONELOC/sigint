import { Domain } from "@shared/domain/identity";
import {
  fetchShipSnapshot,
  type ShipFetchSnapshot,
} from "@/features/tracking/ships/data/fetch";
import {
  isShipPoint,
  SHIP_NUMBER_FIELDS,
  SHIP_STRING_FIELDS,
  type ShipPoint,
} from "@/features/tracking/ships/data/codec";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import { parsePointList } from "@/features/base/pointCodec";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import { ScenePatchCodec } from "@/workers/data/render-codecs/sceneCodec";
import { recordPosition } from "@/workers/data/source-model/position";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
} from "@/workers/data/sourceRuntime";
import {
  ShipSceneAttribute,
  ShipSceneSchema,
} from "@/workers/render/scene/shipSchema";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";

export const SHIP_SOURCE = getPointSourceDefinition(Domain.Ships);

export type ShipSourceRuntime = PointSourceRuntime<ShipPoint> &
  Readonly<{ publishRebase: () => void }>;

export type ShipSourceRuntimeOptions = Readonly<{
  readCache: () => Promise<unknown>;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<ShipPoint>,
  ) => Promise<void>;
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<ShipPoint>>;
  publishStatus: (status: DataWorkerSourceSnapshot) => void;
  publishScene: (patch: SceneSourcePatch) => void;
  /** Every entity this poll added or moved, for the trail recorder. */
  observe?: (points: readonly ShipPoint[]) => void;
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

function shipTimestamp(point: ShipPoint): number {
  if (!point.timestamp) return 0;
  const timestamp = Date.parse(point.timestamp);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeSnapshot(
  snapshot: ShipFetchSnapshot,
): PointSourceFetchSnapshot<ShipPoint> {
  return snapshot;
}

export function createShipSourceRuntime(
  options: ShipSourceRuntimeOptions,
): ShipSourceRuntime {
  const codec = new ScenePatchCodec<ShipPoint>({
    source: SHIP_SOURCE.id,
    attributeStride: ShipSceneSchema.AttributeStride,
    position: recordPosition,
    timestamp: shipTimestamp,
    writeAttributes: (point, target, offset) => {
      target[offset + ShipSceneAttribute.Heading] =
        point.data.heading ?? 0;
    },
  });
  const runtime = createPointSourceRuntime<ShipPoint>({
    id: SHIP_SOURCE.id,
    cacheKey: SHIP_SOURCE.cacheKey,
    pollIntervalMs: SHIP_SOURCE.pollIntervalMs,
    maxQueryItems: POINT_UI_QUERY_POLICY.datasetQueryLimit,
    hasChanged: shipChanged,
    readCache: options.readCache,
    parseCache: parseShipCache,
    persistCache: options.persistCache,
    fetchSnapshot:
      options.fetchSnapshot ??
      (async () => normalizeSnapshot(await fetchShipSnapshot())),
    publishStatus: options.publishStatus,
    publishPatch: (patch) => {
      options.observe?.(patch.upserts);
      options.publishScene(codec.encode(patch));
    },
  });
  return {
    ...runtime,
    publishRebase(): void {
      const patch = runtime.rebase();
      if (patch) options.publishScene(codec.encode(patch));
    },
  };
}
