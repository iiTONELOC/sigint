import type { EventPoint } from "@/features/intel/events/data/codec";
import { authenticatedFetch } from "@/lib/net/authService";
import type { DatasetCompleteness } from "@/workers/data/datasetStore";
import {
  RemoteSource,
  SourceFetchFailure,
  type SourceFailureMessages,
  type SourceTransport,
} from "@/workers/data/source-model/remoteSource";
import {
  EventEndpoint,
  isGdeltEvent,
  parseEventsLatestResponse,
  type GdeltEvent,
} from "@shared/domain/events";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";

const EVENT_TRANSPORT: SourceTransport = {
  url: EventEndpoint.Latest,
  headers: {},
  fetchImpl: authenticatedFetch,
};

const EVENT_SOURCE_FAILURE_MESSAGES = {
  [SourceFetchFailure.Request]: "The events request failed",
  [SourceFetchFailure.Payload]:
    "The events response did not match the Events contract",
} satisfies SourceFailureMessages;

enum EventFetchPolicy {
  HashShift = 5,
  HashRadix = 36,
}

enum EventIdentityToken {
  Prefix = "GE",
  Separator = "-",
}

function hashString(value: string): string {
  let hash = 0;
  for (const character of value) {
    hash = Math.trunc(
      (hash << EventFetchPolicy.HashShift) -
        hash +
        (character.codePointAt(0) ?? 0),
    );
  }
  return Math.abs(hash).toString(EventFetchPolicy.HashRadix);
}

function toEventPoint(
  event: GdeltEvent,
  index: number,
  observedAt: number,
): EventPoint {
  return {
    id: event.data.url
      ? `${EventIdentityToken.Prefix}${hashString(event.data.url)}`
      : `${EventIdentityToken.Prefix}${index}${EventIdentityToken.Separator}${observedAt}`,
    type: Domain.Events,
    lat: event.lat,
    lon: event.lon,
    timestamp: event.timestamp,
    data: event.data,
  };
}

class EventFeed extends RemoteSource<EventPoint> {
  protected readonly transport: SourceTransport = EVENT_TRANSPORT;

  protected readonly failureMessages: SourceFailureMessages =
    EVENT_SOURCE_FAILURE_MESSAGES;

  protected readonly completeness: DatasetCompleteness =
    SourceCompleteness.Partial;

  protected items(payload: unknown): readonly unknown[] | null {
    return parseEventsLatestResponse(payload)?.data ?? null;
  }

  protected toEntity(
    item: unknown,
    observedAt: number,
    index: number,
  ): EventPoint | null {
    return isGdeltEvent(item) ? toEventPoint(item, index, observedAt) : null;
  }
}

export const EVENT_FEED = new EventFeed();
