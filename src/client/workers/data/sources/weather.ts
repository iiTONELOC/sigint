import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import { Domain } from "@shared/domain/identity";
import {
  parseWeatherCache,
  type WeatherPoint,
} from "@/features/environmental/weather/data/codec";
import { fetchWeatherSnapshot } from "@/features/environmental/weather/data/fetch";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
} from "@/workers/data/sourceRuntime";

export const WEATHER_SOURCE = getPointSourceDefinition(Domain.Weather);

export type WeatherSourceRuntime = PointSourceRuntime<WeatherPoint> &
  Readonly<{ publishRebase: () => void }>;

export type WeatherSourceRuntimeOptions = Readonly<{
  readCache: () => Promise<unknown>;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<WeatherPoint>,
  ) => Promise<void> | void;
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<WeatherPoint>>;
  publishStatus: (status: DataWorkerSourceSnapshot) => void;
  publishPoints: (points: readonly WeatherPoint[]) => void;
}>;

function weatherChanged(
  previous: WeatherPoint,
  next: WeatherPoint,
): boolean {
  return (
    previous.lat !== next.lat ||
    previous.lon !== next.lon ||
    previous.timestamp !== next.timestamp ||
    previous.data.severity !== next.data.severity ||
    previous.data.expires !== next.data.expires ||
    previous.data.headline !== next.data.headline
  );
}

export function createWeatherSourceRuntime(
  options: WeatherSourceRuntimeOptions,
): WeatherSourceRuntime {
  const runtime = createPointSourceRuntime<WeatherPoint>({
    id: WEATHER_SOURCE.id,
    cacheKey: WEATHER_SOURCE.cacheKey,
    pollIntervalMs: WEATHER_SOURCE.pollIntervalMs,
    maxQueryItems: POINT_UI_QUERY_POLICY.datasetQueryLimit,
    hasChanged: weatherChanged,
    readCache: options.readCache,
    parseCache: parseWeatherCache,
    persistCache: options.persistCache,
    fetchSnapshot: options.fetchSnapshot ?? fetchWeatherSnapshot,
    publishStatus: options.publishStatus,
    publishPatch: () => {
      options.publishPoints(runtime.values());
    },
  });
  return {
    ...runtime,
    publishRebase(): void {
      options.publishPoints(runtime.values());
    },
  };
}
