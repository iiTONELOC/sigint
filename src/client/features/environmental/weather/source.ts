import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import {
  EntityLifetime,
  GeoCarrier,
  StationaryGeoDataSource,
  type SourcePolicy,
} from "@/workers/data/source-model/dataSource";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import { Domain } from "@shared/domain/identity";
import { geoPointsEqual } from "@shared/geo";
import { SourceCompletenessPolicy } from "@shared/domain/sourcePolicy";
import { parseWeatherCache } from "./data/codec";
import type { WeatherPoint } from "./types";
import { fetchWeatherSnapshot } from "./data/fetch";
import { WEATHER_UI_QUERIES } from "./data/uiQueries";

export const WEATHER_SOURCE_POLICY: SourcePolicy = {
  id: Domain.Weather,
  cacheKey: CACHE_KEYS.weather,
  pollIntervalMs: POLL_INTERVALS.weather,
  completeness: SourceCompletenessPolicy.Complete,
  emptyResultIsComplete: true,
};

export class WeatherAlertSource extends StationaryGeoDataSource<WeatherPoint> {
  readonly policy = WEATHER_SOURCE_POLICY;
  readonly carrier = GeoCarrier.Polygon;
  readonly lifetime = EntityLifetime.Ephemeral;
  readonly pointType = Domain.Weather;
  readonly queries = WEATHER_UI_QUERIES;

  protected parseCache(value: unknown): readonly WeatherPoint[] | null {
    return parseWeatherCache(value);
  }

  protected fetchSnapshot(): Promise<PointSourceFetchSnapshot<WeatherPoint>> {
    return fetchWeatherSnapshot();
  }

  protected hasChanged(previous: WeatherPoint, next: WeatherPoint): boolean {
    return (
      !geoPointsEqual(previous.position, next.position) ||
      previous.timestamp !== next.timestamp ||
      previous.data.severity !== next.data.severity ||
      previous.data.expires !== next.data.expires ||
      previous.data.headline !== next.data.headline
    );
  }
}
