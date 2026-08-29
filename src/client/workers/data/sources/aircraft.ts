import {
  aircraftDataEquals,
  parseAdsbResponse,
  parseAircraftCache,
} from "@/features/tracking/aircraft/data/codec";
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
import {
  AircraftApiRoute,
  squawkStatusFor,
  type AircraftData,
  type AircraftPoint,
} from "@shared/domain/aircraft";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import { Domain } from "@shared/domain/identity";
import { isRecord } from "@shared/geo";
import {
  AIRCRAFT_SCENE_SQUAWK_CODES,
  AircraftSceneAttribute,
  AircraftSceneFlag,
  AircraftSceneStringAttribute,
} from "@shared/scene";
import { parseSourceState, SourceCompleteness } from "@shared/source";

const AIRCRAFT_SOURCE_FAILURE_MESSAGES = {
  [SourceFetchFailure.Request]: "The aircraft endpoint rejected the request",
  [SourceFetchFailure.Payload]: "The aircraft response format is invalid",
} satisfies SourceFailureMessages;

function aircraftFlags(data: AircraftData): number {
  return (
    (data.military ? AircraftSceneFlag.Military : 0) +
    (data.recon ? AircraftSceneFlag.Recon : 0) +
    (data.onGround ? AircraftSceneFlag.OnGround : 0)
  );
}

/** The server states the completeness and observation time of each sweep. */
async function fetchAircraftSnapshot(): Promise<
  PointSourceFetchSnapshot<AircraftPoint>
> {
  const response = await authenticatedFetch(AircraftApiRoute.States);
  if (!response.ok) {
    throw new SourceFetchError(
      SourceFetchFailure.Request,
      AIRCRAFT_SOURCE_FAILURE_MESSAGES,
      response.status,
    );
  }
  const receivedAt = Date.now();
  const payload: unknown = await response.json();
  const source = isRecord(payload)
    ? parseSourceState(payload.source)
    : null;
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.ac) ||
    source?.source !== Domain.Aircraft
  ) {
    throw new SourceFetchError(
      SourceFetchFailure.Payload,
      AIRCRAFT_SOURCE_FAILURE_MESSAGES,
    );
  }
  return {
    completeness: source.completeness === SourceCompleteness.Complete
      ? SourceCompleteness.Complete
      : SourceCompleteness.Partial,
    entities: parseAdsbResponse(payload, receivedAt),
    observedAt: source.observedAt ?? source.receivedAt ?? receivedAt,
  };
}

export class AircraftSource extends MovingPointSource<
  Domain.Aircraft,
  AircraftPoint
> {
  constructor(options: PointSourceOptions<AircraftPoint> = {}) {
    super({
      policy: getPointSourceDefinition(Domain.Aircraft),
      carrier: GeoCarrier.Position,
      parseCache: parseAircraftCache,
      fetchSnapshot: options.fetchSnapshot ?? fetchAircraftSnapshot,
      hasChanged: recordChanged(aircraftDataEquals),
      ...(options.patchObservers
        ? { patchObservers: options.patchObservers }
        : {}),
    });
  }
}

export function aircraftSceneBinding(
  trails: MovingSceneTrailReader,
  publishScene: SceneCommandPublisher,
): SceneBinding<AircraftPoint, MovingSceneRecord<AircraftPoint>> {
  return movingSceneBinding(publishScene, {
    source: Domain.Aircraft,
    trails,
    motion: (point) => ({
      directionDegrees: point.data.heading ?? 0,
      speedMetersPerSecond: ktToMps(point.data.speed ?? 0),
    }),
    writeAttributes: (point, target, offset) => {
      target[offset + AircraftSceneAttribute.Heading] =
        point.data.heading ?? 0;
      target[offset + AircraftSceneAttribute.Flags] =
        aircraftFlags(point.data);
      target[offset + AircraftSceneAttribute.Squawk] =
        AIRCRAFT_SCENE_SQUAWK_CODES[squawkStatusFor(point.data.squawk)];
    },
    writeStringAttributes: (point, target, offset, intern) => {
      target[offset + AircraftSceneStringAttribute.Country] =
        intern(point.data.originCountry ?? "");
    },
  });
}
