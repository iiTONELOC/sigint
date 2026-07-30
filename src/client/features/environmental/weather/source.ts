import {
  EntityLifetime,
  GeoCarrier,
  StationaryGeoDataSource,
  type SourcePolicy,
} from "@/workers/data/source-model/dataSource";
import {
  SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  ScenePatchCodec,
  sceneTimestamp,
} from "@/workers/data/render-codecs/sceneCodec";
import { recordPosition } from "@/workers/data/source-model/position";
import type {
  PointSourceFetchSnapshot,
  PointSourceSchedule,
} from "@/workers/data/sourceRuntime";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import {
  WeatherSceneAttribute,
  WeatherSceneSchema,
} from "@/workers/render/scene/weatherSchema";
import { Domain } from "@shared/domain/identity";
import {
  geoPointsEqual,
  geoPolygonGeometryEqual,
} from "@shared/geo";
import { weatherSeverityRank } from "./severity";
import { parseWeatherCache } from "./data/codec";
import type { WeatherPoint } from "./types";
import { fetchWeatherSnapshot } from "./data/fetch";
import { WEATHER_UI_QUERIES } from "./data/uiQueries";

export const WEATHER_SOURCE_POLICY: SourcePolicy = {
  ...getPointSourceDefinition(Domain.Weather),
};

export type WeatherAlertSourceOptions = Readonly<{
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<WeatherPoint>>;
  schedule?: PointSourceSchedule;
}>;

export class WeatherAlertSource extends StationaryGeoDataSource<WeatherPoint> {
  readonly policy = WEATHER_SOURCE_POLICY;
  readonly carrier = GeoCarrier.Polygon;
  readonly lifetime = EntityLifetime.Ephemeral;
  readonly pointType = Domain.Weather;
  readonly queries = WEATHER_UI_QUERIES;

  private readonly fetchSnapshotOverride:
    | (() => Promise<PointSourceFetchSnapshot<WeatherPoint>>)
    | null;

  constructor(options: WeatherAlertSourceOptions = {}) {
    super([], options.schedule ? { schedule: options.schedule } : {});
    this.fetchSnapshotOverride = options.fetchSnapshot ?? null;
  }

  protected parseCache(value: unknown): readonly WeatherPoint[] | null {
    return parseWeatherCache(value);
  }

  protected fetchSnapshot(): Promise<PointSourceFetchSnapshot<WeatherPoint>> {
    return this.fetchSnapshotOverride?.() ?? fetchWeatherSnapshot();
  }

  protected hasChanged(previous: WeatherPoint, next: WeatherPoint): boolean {
    return (
      !geoPointsEqual(previous.position, next.position) ||
      previous.timestamp !== next.timestamp ||
      previous.data.severity !== next.data.severity ||
      previous.data.expires !== next.data.expires ||
      previous.data.headline !== next.data.headline ||
      !geoPolygonGeometryEqual(
        previous.data.geometry,
        next.data.geometry,
      )
    );
  }
}

export class WeatherSceneBinding extends SceneBinding<WeatherPoint> {
  constructor(publishScene: SceneCommandPublisher) {
    super(
      new ScenePatchCodec<WeatherPoint>({
        source: Domain.Weather,
        attributeStride: WeatherSceneSchema.AttributeStride,
        stringAttributeStride:
          WeatherSceneSchema.StringAttributeStride,
        position: recordPosition,
        timestamp: sceneTimestamp,
        geometry: (point) => point.data.geometry,
        writeAttributes: (point, target, offset) => {
          target[offset + WeatherSceneAttribute.Severity] =
            weatherSeverityRank(point.data.severity);
        },
      }),
      publishScene,
    );
  }
}
