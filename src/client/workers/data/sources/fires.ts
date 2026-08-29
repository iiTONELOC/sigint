import { parsePoints } from "@/features/base/pointCodec";
import {
  FIRE_FEED,
  parseFirePoint,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import {
  pointSceneBinding,
  type SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  GeoCarrier,
  StationaryPointSource,
  feedFetch,
  recordChanged,
  type PointSourceOptions,
} from "@/workers/data/source-model/dataSource";
import { SourceFetchError } from "@/workers/data/source-model/remoteSource";
import { fireDataEquals } from "@shared/domain/fireDayNight";
import { Domain } from "@shared/domain/identity";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import { SourceStatus } from "@shared/domain/sourceStatus";
import { FireSceneAttribute } from "@shared/scene";

export enum FireHttpStatus {
  ServiceUnavailable = 503,
}

function fireFailureStatus(error: unknown): SourceStatus {
  return error instanceof SourceFetchError &&
    error.httpStatus === FireHttpStatus.ServiceUnavailable
    ? SourceStatus.Unavailable
    : SourceStatus.Error;
}

export class FireSource extends StationaryPointSource<
  Domain.Fire,
  FirePoint
> {
  constructor(options: PointSourceOptions<FirePoint> = {}) {
    super({
      policy: getPointSourceDefinition(Domain.Fire),
      carrier: GeoCarrier.Position,
      parseCache: (value) => parsePoints(value, parseFirePoint),
      fetchSnapshot: feedFetch(options, FIRE_FEED),
      hasChanged: recordChanged(fireDataEquals),
      failureStatus: fireFailureStatus,
      ...(options.schedule ? { schedule: options.schedule } : {}),
    });
  }
}

export function fireSceneBinding(
  publishScene: SceneCommandPublisher,
): SceneBinding<FirePoint> {
  return pointSceneBinding(publishScene, {
    source: Domain.Fire,
    writeAttributes: (point, target, offset) => {
      target[offset + FireSceneAttribute.RadiativePower] =
        point.data.frp ?? 0;
    },
  });
}
