import {
  WEATHER_TEXT_FIELDS,
  parseWeatherSeverity,
  type WeatherPoint,
  type WeatherTextField,
} from "@shared/domain/weather";
import type { DatasetCompleteness } from "@/workers/data/datasetStore";
import {
  NWS_ALERTS_TRANSPORT,
  NWS_SOURCE_FAILURE_MESSAGES,
} from "@/workers/data/source-model/feeds";
import {
  RemoteSource,
  type SourceFailureMessages,
  type SourceTransport,
} from "@/workers/data/source-model/remoteSource";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import { EMPTY_TEXT, nonEmptyText } from "@shared/text";
import {
  geometryCentroid,
  isNullIsland,
  isRecord,
  parseGeoJsonPolygonGeometry,
} from "@shared/geo";

enum WeatherPayloadField {
  Features = "features",
  Properties = "properties",
  Id = "id",
  Geometry = "geometry",
  Sent = "sent",
  Effective = "effective",
  Severity = "severity",
}

enum WeatherIdentity {
  Prefix = "WX",
}

enum WeatherIdentityPolicy {
  TailLength = 12,
}

const ID_DISALLOWED = /[^a-zA-Z0-9]/g;

function alertId(value: unknown): string | null {
  const source = nonEmptyText(value);
  if (!source) return null;
  const tail = source
    .replace(ID_DISALLOWED, EMPTY_TEXT)
    .slice(-WeatherIdentityPolicy.TailLength);
  return tail.length > 0 ? `${WeatherIdentity.Prefix}${tail}` : null;
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
    NWS_SOURCE_FAILURE_MESSAGES[Domain.Weather];

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

export const WEATHER_ALERT_FEED = new WeatherAlertFeed();
