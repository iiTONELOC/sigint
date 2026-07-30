import {
  AIRCRAFT_BOOLEAN_FIELDS as BOOLEAN_FIELDS,
  AIRCRAFT_NUMBER_FIELDS as NUMBER_FIELDS,
  AIRCRAFT_STRING_FIELDS as STRING_FIELDS,
  isAircraftPoint,
  parseAircraftCache,
  type AircraftPoint,
} from "@/features/tracking/aircraft/data/codec";
import { fetchAircraftSnapshot } from "@/features/tracking/aircraft/data/parseAdsbV2";
import { AIRCRAFT_UI_QUERIES } from "@/features/tracking/aircraft/data/uiQueries";
import type { AircraftData } from "@/features/tracking/aircraft/types";
import {
  SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  ScenePatchCodec,
} from "@/workers/data/render-codecs/sceneCodec";
import {
  movingSceneMotionPosition,
  movingScenePosition,
  movingSceneRecords,
  movingSceneTimestamp,
  writeMovingSceneAttributes,
  type MovingSceneRecord,
  type MovingSceneTrailReader,
} from "@/workers/data/render-codecs/movingSceneRecord";
import {
  EntityLifetime,
  GeoCarrier,
  GeoDataSource,
  GeoMotion,
  type SourcePatchObserver,
  type SourcePolicy,
} from "@/workers/data/source-model/dataSource";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import {
  AircraftSceneAttribute,
  AircraftSceneFlag,
  AircraftSceneSchema,
  AircraftSceneSquawk,
  AircraftSceneStringAttribute,
} from "@/workers/render/scene/aircraftSchema";
import { SquawkStatus } from "@shared/domain/aircraft";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";

export { isAircraftPoint, parseAircraftCache, type AircraftPoint };

export const AIRCRAFT_SOURCE = getPointSourceDefinition(Domain.Aircraft);

export type AircraftSourceOptions = Readonly<{
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<AircraftPoint>>;
  patchObservers?: readonly SourcePatchObserver<AircraftPoint>[];
}>;

function arraysEqual(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function aircraftChanged(
  previous: AircraftPoint,
  next: AircraftPoint,
): boolean {
  if (
    previous.lat !== next.lat ||
    previous.lon !== next.lon ||
    previous.timestamp !== next.timestamp
  ) {
    return true;
  }
  if (
    STRING_FIELDS.some(
      (key) => previous.data[key] !== next.data[key],
    ) ||
    NUMBER_FIELDS.some(
      (key) => previous.data[key] !== next.data[key],
    ) ||
    BOOLEAN_FIELDS.some(
      (key) => previous.data[key] !== next.data[key],
    )
  ) {
    return true;
  }
  return !arraysEqual(previous.data.navModes, next.data.navModes);
}

function squawkCode(
  value: SquawkStatus | undefined,
): AircraftSceneSquawk {
  if (value === SquawkStatus.Emergency) {
    return AircraftSceneSquawk.Emergency;
  }
  if (value === SquawkStatus.RadioFailure) {
    return AircraftSceneSquawk.RadioFailure;
  }
  if (value === SquawkStatus.Hijack) {
    return AircraftSceneSquawk.Hijack;
  }
  return AircraftSceneSquawk.Normal;
}

function aircraftFlags(data: AircraftData): number {
  return (
    (data.military ? AircraftSceneFlag.Military : 0) +
    (data.recon ? AircraftSceneFlag.Recon : 0) +
    (data.onGround ? AircraftSceneFlag.OnGround : 0)
  );
}

async function fetchLiveAircraft(): Promise<
  PointSourceFetchSnapshot<AircraftPoint>
> {
  const result = await fetchAircraftSnapshot();
  return {
    completeness:
      result.source.completeness === SourceCompleteness.Complete
        ? SourceCompleteness.Complete
        : SourceCompleteness.Partial,
    entities: result.data.filter(isAircraftPoint),
    observedAt:
      result.source.observedAt ??
      result.source.receivedAt ??
      Date.now(),
  };
}

export class AircraftSource extends GeoDataSource<AircraftPoint> {
  readonly policy: SourcePolicy = AIRCRAFT_SOURCE;
  readonly carrier = GeoCarrier.Position;
  readonly motion = GeoMotion.Moving;
  readonly lifetime = EntityLifetime.Ephemeral;
  readonly pointType = Domain.Aircraft;
  readonly queries = AIRCRAFT_UI_QUERIES;

  private readonly fetchOverride:
    | (() => Promise<PointSourceFetchSnapshot<AircraftPoint>>)
    | null;

  constructor(options: AircraftSourceOptions = {}) {
    super(options.patchObservers);
    this.fetchOverride = options.fetchSnapshot ?? null;
  }

  protected parseCache(value: unknown): readonly AircraftPoint[] | null {
    return parseAircraftCache(value);
  }

  protected fetchSnapshot(): Promise<
    PointSourceFetchSnapshot<AircraftPoint>
  > {
    return this.fetchOverride?.() ?? fetchLiveAircraft();
  }

  protected hasChanged(
    previous: AircraftPoint,
    next: AircraftPoint,
  ): boolean {
    return aircraftChanged(previous, next);
  }
}

export class AircraftSceneBinding extends SceneBinding<
  AircraftPoint,
  MovingSceneRecord<AircraftPoint>
> {
  constructor(
    trails: MovingSceneTrailReader,
    publishScene: SceneCommandPublisher,
  ) {
    super(
      new ScenePatchCodec<
        AircraftPoint,
        MovingSceneRecord<AircraftPoint>
      >({
        source: Domain.Aircraft,
        attributeStride: AircraftSceneSchema.AttributeStride,
        stringAttributeStride:
          AircraftSceneSchema.StringAttributeStride,
        records: (point) =>
          movingSceneRecords(Domain.Aircraft, trails, point),
        position: movingScenePosition,
        motionPosition: movingSceneMotionPosition,
        timestamp: movingSceneTimestamp,
        writeAttributes: (record, target, offset) => {
          const point = record.entity;
          target[offset + AircraftSceneAttribute.Heading] =
            point.data.heading ?? 0;
          target[offset + AircraftSceneAttribute.Flags] =
            aircraftFlags(point.data);
          target[offset + AircraftSceneAttribute.Squawk] =
            squawkCode(point.data.squawkStatus);
          writeMovingSceneAttributes(
            record,
            target,
            offset + AircraftSceneSchema.MotionAttributeOffset,
            {
              directionDegrees: point.data.heading ?? 0,
              speedMetersPerSecond: point.data.speedMps ?? 0,
            },
          );
        },
        writeStringAttributes: (record, target, offset, intern) => {
          target[offset + AircraftSceneStringAttribute.Country] =
            intern(record.entity.data.originCountry ?? "");
        },
      }),
      publishScene,
    );
  }
}
