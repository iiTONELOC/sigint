import type { DataPoint } from "@/features/base/dataPoints";
import { parseDataPoint } from "@/features/base/pointCodec";
import { authenticatedFetch } from "@/lib/net/authService";
import type { DatasetCompleteness } from "@/workers/data/datasetStore";
import {
  RemoteSource,
  SourceFetchFailure,
  type SourceFailureMessages,
  type SourceTransport,
} from "@/workers/data/source-model/remoteSource";
import {
  FIRE_LATEST_ROUTE,
  parseFireData,
} from "@shared/domain/fireDayNight";
import { Domain } from "@shared/domain/identity";
import { createGeoPoint, isRecord } from "@shared/geo";
import { SourceCompleteness } from "@shared/source";
import { optionalString } from "@shared/text";
import { optionalFiniteNumber } from "@shared/types/numbers";

export type FirePoint = Extract<DataPoint, { type: Domain.Fires }>;

const FIRE_TRANSPORT: SourceTransport = {
  url: FIRE_LATEST_ROUTE,
  headers: {},
  timeoutMs: 20_000,
  fetchImpl: authenticatedFetch,
};

const FIRE_SOURCE_FAILURE_MESSAGES = {
  [SourceFetchFailure.Request]: "The fires endpoint rejected the request",
  [SourceFetchFailure.Payload]: "The fires response format is invalid",
} satisfies SourceFailureMessages;

enum FireIdentityToken {
  Prefix = "FI",
  UnknownSatellite = "unknown",
  Separator = ":",
  Empty = "",
}

export function parseFirePoint(value: unknown): FirePoint | null {
  return parseDataPoint(value, Domain.Fires, parseFireData);
}

function acquisitionTimestamp(
  acquisitionDate: string,
  acquisitionTime: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)) return null;
  if (!/^\d{4}$/.test(acquisitionTime)) return null;
  const timestamp = Date.parse(
    `${acquisitionDate}T${acquisitionTime.slice(0, 2)}:${acquisitionTime.slice(2)}:00Z`,
  );
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseServerFire(value: unknown): FirePoint | null {
  if (!isRecord(value)) return null;
  const data = parseFireData(value);
  const latitude = optionalFiniteNumber(value.lat);
  const longitude = optionalFiniteNumber(value.lon);
  const acquisitionDate = optionalString(value.acqDate);
  const acquisitionTime = optionalString(value.acqTime);
  if (
    latitude === undefined ||
    longitude === undefined ||
    (latitude === 0 && longitude === 0) ||
    !acquisitionDate ||
    !acquisitionTime ||
    !data
  ) {
    return null;
  }
  const coordinate = createGeoPoint(longitude, latitude);
  const timestamp = acquisitionTimestamp(acquisitionDate, acquisitionTime);
  if (!coordinate || !timestamp) return null;
  const satellite =
    optionalString(value.satellite) ??
    FireIdentityToken.UnknownSatellite;
  const id = [
    FireIdentityToken.Prefix,
    satellite,
    acquisitionDate.replaceAll("-", FireIdentityToken.Empty),
    acquisitionTime,
    coordinate[1].toFixed(4),
    coordinate[0].toFixed(4),
  ].join(FireIdentityToken.Separator);
  return {
    id,
    type: Domain.Fires,
    lat: coordinate[1],
    lon: coordinate[0],
    timestamp,
    data: {
      ...data,
      satellite,
      acqDate: acquisitionDate,
      acqTime: acquisitionTime,
    },
  };
}

class FireFeed extends RemoteSource<FirePoint> {
  protected readonly transport: SourceTransport = FIRE_TRANSPORT;

  protected readonly failureMessages: SourceFailureMessages =
    FIRE_SOURCE_FAILURE_MESSAGES;

  protected readonly completeness: DatasetCompleteness =
    SourceCompleteness.Complete;

  protected items(payload: unknown): readonly unknown[] | null {
    return isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : null;
  }

  protected toEntity(item: unknown): FirePoint | null {
    return parseServerFire(item);
  }
}

export const FIRE_FEED = new FireFeed();
