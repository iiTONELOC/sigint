import {
  fetchShipSnapshot,
  type ShipFetchSnapshot,
} from "@/features/tracking/ships/data/fetch";
import {
  isShipPoint,
  type ShipPoint,
} from "@/features/tracking/ships/data/codec";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import { parsePointList } from "@/features/base/pointCodec";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import { createScenePatchCodec } from "@/workers/data/render-codecs/sceneCodec";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
} from "@/workers/data/sourceRuntime";
import { SHIP_SCENE } from "@/workers/render/scene/shipSchema";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";

export const SHIP_SOURCE = getPointSourceDefinition("ships");

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

const STRING_FIELDS = [
  "name",
  "callSign",
  "vesselType",
  "flag",
  "navStatusLabel",
  "destination",
  "eta",
] as const;

const NUMBER_FIELDS = [
  "mmsi",
  "imo",
  "shipTypeCode",
  "speed",
  "sog",
  "cog",
  "heading",
  "navStatus",
  "rot",
  "draught",
  "length",
  "width",
  "dimA",
  "dimB",
  "dimC",
  "dimD",
  "speedMps",
] as const;

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
    STRING_FIELDS.some(
      (key) => previous.data[key] !== next.data[key],
    ) ||
    NUMBER_FIELDS.some(
      (key) => previous.data[key] !== next.data[key],
    )
  );
}

function normalizeSnapshot(
  snapshot: ShipFetchSnapshot,
): PointSourceFetchSnapshot<ShipPoint> {
  return snapshot;
}

export function createShipSourceRuntime(
  options: ShipSourceRuntimeOptions,
): ShipSourceRuntime {
  const codec = createScenePatchCodec<ShipPoint>({
    source: SHIP_SOURCE.id,
    attributeStride: SHIP_SCENE.attributeStride,
    writeAttributes: (point, target, offset) => {
      target[offset + SHIP_SCENE.attributes.heading] =
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
