import {
  EARTHQUAKE_FEED_POLICY,
  fetchEarthquakes,
  parseEarthquakePoint,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import { EARTHQUAKE_UI_QUERIES } from "@/features/environmental/earthquake/data/uiQueries";
import {
  SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  ScenePatchCodec,
  sceneTimestamp,
} from "@/workers/data/render-codecs/sceneCodec";
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
  EarthquakeSceneAttribute,
  EarthquakeSceneSchema,
} from "@/workers/render/scene/earthquakeSchema";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";

enum EarthquakeSceneDefault {
  Numeric = 0,
}

export const EARTHQUAKE_SOURCE: SourcePolicy = {
  ...getPointSourceDefinition(Domain.Earthquake),
  retryIntervalMs: EARTHQUAKE_FEED_POLICY.retryIntervalMs,
};

export type EarthquakeSourceOptions = Readonly<{
  fetchPoints?: () => Promise<EarthquakePoint[]>;
  now?: () => number;
  schedule?: PointSourceSchedule;
}>;

function parseEarthquakeCache(
  value: unknown,
): readonly EarthquakePoint[] | null {
  if (!Array.isArray(value)) return null;
  const points: EarthquakePoint[] = [];
  for (const candidate of value) {
    const point = parseEarthquakePoint(candidate);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

function earthquakeChanged(
  previous: EarthquakePoint,
  next: EarthquakePoint,
): boolean {
  return (
    previous.lat !== next.lat ||
    previous.lon !== next.lon ||
    previous.timestamp !== next.timestamp ||
    previous.data.magnitude !== next.data.magnitude ||
    previous.data.depth !== next.data.depth ||
    previous.data.location !== next.data.location ||
    previous.data.felt !== next.data.felt ||
    previous.data.tsunami !== next.data.tsunami ||
    previous.data.alert !== next.data.alert ||
    previous.data.significance !== next.data.significance ||
    previous.data.magType !== next.data.magType ||
    previous.data.eventType !== next.data.eventType ||
    previous.data.url !== next.data.url ||
    previous.data.status !== next.data.status
  );
}

export class EarthquakeSource extends StationaryGeoDataSource<EarthquakePoint> {
  readonly policy = EARTHQUAKE_SOURCE;
  readonly carrier = GeoCarrier.Position;
  readonly lifetime = EntityLifetime.Ephemeral;
  readonly pointType = Domain.Quakes;
  readonly queries = EARTHQUAKE_UI_QUERIES;

  private readonly fetchPoints: () => Promise<EarthquakePoint[]>;
  private readonly now: () => number;

  constructor(options: EarthquakeSourceOptions = {}) {
    super(
      [],
      options.schedule ? { schedule: options.schedule } : {},
    );
    this.fetchPoints = options.fetchPoints ?? fetchEarthquakes;
    this.now = options.now ?? Date.now;
  }

  protected parseCache(value: unknown): readonly EarthquakePoint[] | null {
    return parseEarthquakeCache(value);
  }

  protected async fetchSnapshot(): Promise<
    PointSourceFetchSnapshot<EarthquakePoint>
  > {
    return {
      completeness: SourceCompleteness.Complete,
      entities: await this.fetchPoints(),
      observedAt: this.now(),
    };
  }

  protected hasChanged(
    previous: EarthquakePoint,
    next: EarthquakePoint,
  ): boolean {
    return earthquakeChanged(previous, next);
  }
}

export class EarthquakeSceneBinding extends SceneBinding<EarthquakePoint> {
  constructor(publishScene: SceneCommandPublisher) {
    super(
      new ScenePatchCodec<EarthquakePoint>({
        source: Domain.Earthquake,
        attributeStride: EarthquakeSceneSchema.AttributeStride,
        stringAttributeStride:
          EarthquakeSceneSchema.StringAttributeStride,
        position: recordPosition,
        timestamp: sceneTimestamp,
        writeAttributes: (point, target, offset) => {
          target[offset + EarthquakeSceneAttribute.Magnitude] =
            point.data.magnitude ?? EarthquakeSceneDefault.Numeric;
        },
      }),
      publishScene,
    );
  }
}
