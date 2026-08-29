import {
  pointSceneBinding,
  type SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import { scenePolygonGeometry } from "@/workers/data/render-codecs/sceneCodec";
import {
  GeoCarrier,
  StationaryPointSource,
  feedFetch,
  recordChanged,
  type PointSourceOptions,
} from "@/workers/data/source-model/dataSource";
import { Domain } from "@shared/domain/identity";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import {
  type WeatherData,
  type WeatherPoint,
  weatherSeverityRank,
} from "@shared/domain/weather";
import { geoPolygonGeometryEqual } from "@shared/geo";
import { WeatherSceneAttribute } from "@shared/scene";
import { parseWeatherCache } from "./data/codec";
import { WEATHER_ALERT_FEED } from "./data/fetch";

function weatherAlertEquals(
  previous: WeatherData,
  next: WeatherData,
): boolean {
  return (
    previous.severity === next.severity &&
    previous.expires === next.expires &&
    previous.headline === next.headline &&
    geoPolygonGeometryEqual(previous.geometry, next.geometry)
  );
}

export class WeatherAlertSource extends StationaryPointSource<
  Domain.Weather,
  WeatherPoint
> {
  constructor(options: PointSourceOptions<WeatherPoint> = {}) {
    super({
      policy: getPointSourceDefinition(Domain.Weather),
      carrier: GeoCarrier.Polygon,
      parseCache: parseWeatherCache,
      fetchSnapshot: feedFetch(options, WEATHER_ALERT_FEED),
      hasChanged: recordChanged(weatherAlertEquals),
      ...(options.schedule ? { schedule: options.schedule } : {}),
    });
  }
}

export function weatherSceneBinding(
  publishScene: SceneCommandPublisher,
): SceneBinding<WeatherPoint> {
  return pointSceneBinding(publishScene, {
    source: Domain.Weather,
    geometry: (point) =>
      point.data.geometry
        ? scenePolygonGeometry(point.data.geometry)
        : null,
    writeAttributes: (point, target, offset) => {
      target[offset + WeatherSceneAttribute.Severity] =
        weatherSeverityRank(point.data.severity);
    },
  });
}
