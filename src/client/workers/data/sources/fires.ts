import {
  FIRE_FEED_POLICY,
  fetchFires,
  fireConfidenceLevel,
  isFireFetchError,
  parseFirePoint,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import { FIRE_UI_QUERIES } from "@/features/environmental/fires/data/uiQueries";
import {
  SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import { ScenePatchCodec } from "@/workers/data/render-codecs/sceneCodec";
import {
  EntityLifetime,
  GeoCarrier,
  StationaryGeoDataSource,
  type SourcePolicy,
} from "@/workers/data/source-model/dataSource";
import { recordPosition } from "@/workers/data/source-model/position";
import type {
  PointSourceFetchSnapshot,
  PointSourceSchedule,
} from "@/workers/data/sourceRuntime";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import {
  FireSceneAttribute,
  FireSceneSchema,
} from "@/workers/render/scene/fireSchema";
import { Domain } from "@shared/domain/identity";
import { SourceStatus } from "@shared/domain/sourceStatus";
import { SourceCompleteness } from "@shared/source";

enum FireSceneDefault {
  Numeric = 0,
}

export enum FireHttpStatus {
  ServiceUnavailable = 503,
}

export const FIRE_SOURCE: SourcePolicy = {
  ...getPointSourceDefinition(Domain.Fire),
  retryIntervalMs: FIRE_FEED_POLICY.retryIntervalMs,
};

export type FireSourceOptions = Readonly<{
  fetchPoints?: () => Promise<FirePoint[]>;
  now?: () => number;
  schedule?: PointSourceSchedule;
}>;

function fireFailureStatus(error: unknown): SourceStatus {
  return isFireFetchError(error) &&
    error.httpStatus === FireHttpStatus.ServiceUnavailable
    ? SourceStatus.Unavailable
    : SourceStatus.Error;
}

function parseFireCache(value: unknown): readonly FirePoint[] | null {
  if (!Array.isArray(value)) return null;
  const points: FirePoint[] = [];
  for (const candidate of value) {
    const point = parseFirePoint(candidate);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

function fireTimestamp(point: FirePoint): number {
  if (!point.timestamp) return FireSceneDefault.Numeric;
  const timestamp = Date.parse(point.timestamp);
  return Number.isFinite(timestamp)
    ? timestamp
    : FireSceneDefault.Numeric;
}

function fireChanged(previous: FirePoint, next: FirePoint): boolean {
  return (
    previous.lat !== next.lat ||
    previous.lon !== next.lon ||
    previous.timestamp !== next.timestamp ||
    previous.data.brightness !== next.data.brightness ||
    previous.data.frp !== next.data.frp ||
    previous.data.confidence !== next.data.confidence ||
    previous.data.satellite !== next.data.satellite ||
    previous.data.instrument !== next.data.instrument ||
    previous.data.scan !== next.data.scan ||
    previous.data.track !== next.data.track ||
    previous.data.brightT31 !== next.data.brightT31 ||
    previous.data.daynight !== next.data.daynight ||
    previous.data.acqDate !== next.data.acqDate ||
    previous.data.acqTime !== next.data.acqTime ||
    previous.data.complexSize !== next.data.complexSize ||
    previous.data.complexFrp !== next.data.complexFrp
  );
}

export class FireSource extends StationaryGeoDataSource<FirePoint> {
  readonly policy = FIRE_SOURCE;
  readonly carrier = GeoCarrier.Position;
  readonly lifetime = EntityLifetime.Ephemeral;
  readonly pointType = Domain.Fires;
  readonly queries = FIRE_UI_QUERIES;

  private readonly fetchPoints: () => Promise<FirePoint[]>;
  private readonly now: () => number;

  constructor(options: FireSourceOptions = {}) {
    super(
      [],
      {
        failureStatus: fireFailureStatus,
        ...(options.schedule ? { schedule: options.schedule } : {}),
      },
    );
    this.fetchPoints = options.fetchPoints ?? fetchFires;
    this.now = options.now ?? Date.now;
  }

  protected parseCache(value: unknown): readonly FirePoint[] | null {
    return parseFireCache(value);
  }

  protected async fetchSnapshot(): Promise<
    PointSourceFetchSnapshot<FirePoint>
  > {
    return {
      completeness: SourceCompleteness.Complete,
      entities: await this.fetchPoints(),
      observedAt: this.now(),
    };
  }

  protected hasChanged(previous: FirePoint, next: FirePoint): boolean {
    return fireChanged(previous, next);
  }
}

export class FireSceneBinding extends SceneBinding<FirePoint> {
  constructor(publishScene: SceneCommandPublisher) {
    super(
      new ScenePatchCodec<FirePoint>({
        source: Domain.Fire,
        attributeStride: FireSceneSchema.AttributeStride,
        stringAttributeStride: FireSceneSchema.StringAttributeStride,
        position: recordPosition,
        timestamp: fireTimestamp,
        writeAttributes: (point, target, offset) => {
          target[offset + FireSceneAttribute.RadiativePower] =
            point.data.frp ?? FireSceneDefault.Numeric;
          target[offset + FireSceneAttribute.Confidence] =
            fireConfidenceLevel(point.data.confidence);
        },
      }),
      publishScene,
    );
  }
}
