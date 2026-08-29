import { parsePoints } from "@/features/base/pointCodec";
import {
  decodeShipPoints,
  isShipPoint,
  parseLegacyShipPoint,
  parseShipServerPayload,
  shipDataEquals,
} from "@/features/tracking/ships/data/codec";
import { authenticatedFetch } from "@/lib/net/authService";
import { ktToMps } from "@/measurements";
import type {
  SceneBinding,
  SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  movingSceneBinding,
  type MovingSceneRecord,
  type MovingSceneTrailReader,
} from "@/workers/data/render-codecs/movingSceneRecord";
import {
  GeoCarrier,
  MovingPointSource,
  recordChanged,
  type PointSourceOptions,
} from "@/workers/data/source-model/dataSource";
import {
  SourceFetchError,
  SourceFetchFailure,
  type SourceFailureMessages,
} from "@/workers/data/source-model/remoteSource";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import { Domain } from "@shared/domain/identity";
import {
  SHIPS_LATEST_ROUTE,
  type ShipPoint,
} from "@shared/domain/ships";
import { SourceCompleteness } from "@shared/source";
import { ShipSceneAttribute } from "@shared/scene";

const SHIP_SOURCE_FAILURE_MESSAGES = {
  [SourceFetchFailure.Request]: "The ships endpoint rejected the request",
  [SourceFetchFailure.Payload]: "The ships response format is invalid",
} satisfies SourceFailureMessages;

/** The server states whether the AIS stream was connected and complete. */
async function fetchShipSnapshot(): Promise<
  PointSourceFetchSnapshot<ShipPoint>
> {
  const response = await authenticatedFetch(SHIPS_LATEST_ROUTE);
  if (!response.ok) {
    throw new SourceFetchError(
      SourceFetchFailure.Request,
      SHIP_SOURCE_FAILURE_MESSAGES,
      response.status,
    );
  }
  const payload = parseShipServerPayload(await response.json());
  if (!payload) {
    throw new SourceFetchError(
      SourceFetchFailure.Payload,
      SHIP_SOURCE_FAILURE_MESSAGES,
    );
  }
  return {
    completeness:
      payload.connected &&
      payload.vesselCount === payload.vessels.length
        ? SourceCompleteness.Complete
        : SourceCompleteness.Partial,
    entities: decodeShipPoints(payload),
    observedAt: Date.now(),
  };
}

function parseShipCache(value: unknown): readonly ShipPoint[] | null {
  return parsePoints(value, (candidate) =>
    isShipPoint(candidate) ? candidate : parseLegacyShipPoint(candidate),
  );
}

export class ShipSource extends MovingPointSource<Domain.Ships, ShipPoint> {
  constructor(options: PointSourceOptions<ShipPoint> = {}) {
    super({
      policy: getPointSourceDefinition(Domain.Ships),
      carrier: GeoCarrier.Position,
      parseCache: parseShipCache,
      fetchSnapshot: options.fetchSnapshot ?? fetchShipSnapshot,
      hasChanged: recordChanged(shipDataEquals),
      ...(options.patchObservers
        ? { patchObservers: options.patchObservers }
        : {}),
    });
  }
}

export function shipSceneBinding(
  trails: MovingSceneTrailReader,
  publishScene: SceneCommandPublisher,
): SceneBinding<ShipPoint, MovingSceneRecord<ShipPoint>> {
  return movingSceneBinding(publishScene, {
    source: Domain.Ships,
    trails,
    motion: (point) => ({
      directionDegrees: point.data.cog ?? point.data.heading ?? 0,
      speedMetersPerSecond: ktToMps(point.data.sog ?? 0),
    }),
    writeAttributes: (point, target, offset) => {
      target[offset + ShipSceneAttribute.Heading] = point.data.heading ?? 0;
    },
  });
}
