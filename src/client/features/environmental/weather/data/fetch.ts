import { parseWeatherSeverity } from "@/features/environmental/weather/severity";
import {
  WEATHER_TEXT_FIELDS,
  type WeatherPoint,
  type WeatherTextField,
} from "@/features/environmental/weather/types";
import type { DatasetCompleteness } from "@/workers/data/datasetStore";
import { NWS_ALERTS_TRANSPORT } from "@/workers/data/source-model/feeds";
import {
  RemoteSource,
  type SourceFailureMessages,
  type SourceTransport,
} from "@/workers/data/source-model/remoteSource";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import { EMPTY_TEXT, nonEmptyText } from "@shared/text";
import {
  geometryCentroid,
  isNullIsland,
  isRecord,
  parseGeoJsonPolygonGeometry,
} from "@shared/geo";

enum WeatherFetchMessage {
  Request = "The weather alerts request failed",
  Payload = "The weather alerts response was not NWS GeoJSON",
}

enum WeatherPayloadField {
  Features = "features",
  Properties = "properties",
  Id = "id",
  Geometry = "geometry",
  Sent = "sent",
  Effective = "effective",
  Severity = "severity",
}

const ID_PREFIX = "WX";
const ID_TAIL_LENGTH = 12;
const ID_DISALLOWED = /[^a-zA-Z0-9]/g;

function alertId(value: unknown): string | null {
  const source = nonEmptyText(value);
  if (!source) return null;
  const tail = source
    .replace(ID_DISALLOWED, EMPTY_TEXT)
    .slice(-ID_TAIL_LENGTH);
  return tail.length > 0 ? `${ID_PREFIX}${tail}` : null;
}

function alertText(
  properties: Readonly<Record<string, unknown>>,
): Partial<Record<WeatherTextField, string>> {
  const text: Partial<Record<WeatherTextField, string>> = {};
  for (const field of WEATHER_TEXT_FIELDS) {
    const value = nonEmptyText(properties[field]);
    if (value !== undefined) text[field] = value;
  }
  return text;
}

class WeatherAlertFeed extends RemoteSource<WeatherPoint> {
  protected readonly transport: SourceTransport = NWS_ALERTS_TRANSPORT;

  protected readonly failureMessages: SourceFailureMessages =
    WeatherFetchMessage;

  protected readonly completeness: DatasetCompleteness =
    SourceCompleteness.Complete;

  protected items(payload: unknown): readonly unknown[] | null {
    if (!isRecord(payload)) return null;
    const features = payload[WeatherPayloadField.Features];
    return Array.isArray(features) ? features : null;
  }

  protected toEntity(item: unknown, observedAt: number): WeatherPoint | null {
    if (!isRecord(item)) return null;
    const properties = item[WeatherPayloadField.Properties];
    if (!isRecord(properties)) return null;

    const id = alertId(properties[WeatherPayloadField.Id]);
    if (!id) return null;

    const geometry = parseGeoJsonPolygonGeometry(
      item[WeatherPayloadField.Geometry],
    );
    if (!geometry) return null;

    const centroid = geometryCentroid(geometry);
    if (!centroid || isNullIsland(centroid)) return null;

    return {
      id,
      type: Domain.Weather,
      position: centroid,
      timestamp:
        nonEmptyText(properties[WeatherPayloadField.Sent]) ??
        nonEmptyText(properties[WeatherPayloadField.Effective]) ??
        new Date(observedAt).toISOString(),
      data: {
        ...alertText(properties),
        geometry,
        severity: parseWeatherSeverity(
          properties[WeatherPayloadField.Severity],
        ),
      },
    };
  }
}

const WEATHER_ALERT_FEED = new WeatherAlertFeed();

export function fetchWeatherSnapshot(
  now: () => number = Date.now,
): Promise<PointSourceFetchSnapshot<WeatherPoint>> {
  return WEATHER_ALERT_FEED.fetchSnapshot(now);
}
