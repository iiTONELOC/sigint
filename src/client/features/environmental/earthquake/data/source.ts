import type { DataPoint } from "@/features/base/dataPoints";
import { parseDataPoint } from "@/features/base/pointCodec";
import type { DatasetCompleteness } from "@/workers/data/datasetStore";
import {
  RemoteSource,
  SourceFetchFailure,
  type SourceFailureMessages,
  type SourceTransport,
} from "@/workers/data/source-model/remoteSource";
import { Domain } from "@shared/domain/identity";
import { parseEarthquakeData } from "@shared/domain/earthquakes";
import { isRecord, parseGeoPoint } from "@shared/geo";
import { SourceCompleteness } from "@shared/source";
import { optionalString } from "@shared/text";
import { optionalFiniteNumber } from "@shared/types/numbers";

export type EarthquakePoint = Extract<DataPoint, { type: Domain.Quakes }>;

const EARTHQUAKE_TRANSPORT: SourceTransport = {
  url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
  headers: {},
  timeoutMs: 20_000,
};

const EARTHQUAKE_SOURCE_FAILURE_MESSAGES = {
  [SourceFetchFailure.Request]: "The USGS endpoint rejected the request",
  [SourceFetchFailure.Payload]: "The USGS response format is invalid",
} satisfies SourceFailureMessages;

export function parseEarthquakePoint(
  value: unknown,
): EarthquakePoint | null {
  return parseDataPoint(value, Domain.Quakes, parseEarthquakeData);
}

function parseFeedFeature(value: unknown): EarthquakePoint | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (!isRecord(value.properties) || !isRecord(value.geometry)) return null;
  const coordinates = value.geometry.coordinates;
  const coordinate = parseGeoPoint(coordinates);
  const originTime = value.properties.time;
  if (
    !coordinate ||
    typeof originTime !== "number" ||
    !Number.isFinite(originTime)
  ) {
    return null;
  }
  const data = parseEarthquakeData({
    magnitude: optionalFiniteNumber(value.properties.mag),
    depth: Array.isArray(coordinates)
      ? optionalFiniteNumber(coordinates[2])
      : undefined,
    location: optionalString(value.properties.place),
    felt: optionalFiniteNumber(value.properties.felt),
    tsunami: value.properties.tsunami === 1,
    alert: optionalString(value.properties.alert),
    significance: optionalFiniteNumber(value.properties.sig),
    magType: optionalString(value.properties.magType),
    eventType: optionalString(value.properties.type),
    url: optionalString(value.properties.url),
    status: optionalString(value.properties.status),
  });
  if (!data) return null;
  return {
    id: `Q${value.id}`,
    type: Domain.Quakes,
    lat: coordinate[1],
    lon: coordinate[0],
    timestamp: new Date(originTime).toISOString(),
    data,
  };
}

class EarthquakeFeed extends RemoteSource<EarthquakePoint> {
  protected readonly transport: SourceTransport = EARTHQUAKE_TRANSPORT;

  protected readonly failureMessages: SourceFailureMessages =
    EARTHQUAKE_SOURCE_FAILURE_MESSAGES;

  protected readonly completeness: DatasetCompleteness =
    SourceCompleteness.Complete;

  protected items(payload: unknown): readonly unknown[] | null {
    return isRecord(payload) && Array.isArray(payload.features)
      ? payload.features
      : null;
  }

  protected toEntity(item: unknown): EarthquakePoint | null {
    return parseFeedFeature(item);
  }
}

export const EARTHQUAKE_FEED = new EarthquakeFeed();
