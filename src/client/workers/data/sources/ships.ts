import {
  fetchShipSnapshot,
  type ShipFetchSnapshot,
} from "@/features/tracking/ships/data/fetch";
import {
  isShipPoint,
  type ShipPoint,
} from "@/features/tracking/ships/data/codec";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { createScenePatchCodec } from "@/workers/data/render-codecs/sceneCodec";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
  type PointSourceStatusSnapshot,
} from "@/workers/data/sourceRuntime";
import { SHIP_SCENE } from "@/workers/render/scene/shipSchema";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";

export type ShipSourceRuntime = PointSourceRuntime<ShipPoint> &
  Readonly<{ publishRebase: () => void }>;

export type ShipSourceRuntimeOptions = Readonly<{
  readCache: () => Promise<unknown | null>;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<ShipPoint>,
  ) => Promise<void>;
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<ShipPoint>>;
  publishStatus: (status: PointSourceStatusSnapshot) => void;
  publishScene: (patch: SceneSourcePatch) => void;
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
  if (!Array.isArray(value)) return null;
  const points: ShipPoint[] = [];
  for (const candidate of value) {
    if (!isShipPoint(candidate)) return null;
    points.push(candidate);
  }
  return points;
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
    source: "ships",
    attributeStride: SHIP_SCENE.attributeStride,
    writeAttributes: (point, target, offset) => {
      target[offset + SHIP_SCENE.attributes.heading] =
        point.data.heading ?? 0;
    },
  });
  const runtime = createPointSourceRuntime<ShipPoint>({
    id: "ships",
    cacheKey: CACHE_KEYS.ships,
    pollIntervalMs: POLL_INTERVALS.ships,
    maxQueryItems: 200,
    hasChanged: shipChanged,
    readCache: options.readCache,
    parseCache: parseShipCache,
    persistCache: options.persistCache,
    fetchSnapshot:
      options.fetchSnapshot ??
      (async () => normalizeSnapshot(await fetchShipSnapshot())),
    publishStatus: options.publishStatus,
    publishPatch: (patch) => {
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
