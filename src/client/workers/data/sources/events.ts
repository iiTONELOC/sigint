import {
  parseEventCache,
  type EventPoint,
} from "@/features/intel/events/data/codec";
import { fetchEventSnapshot } from "@/features/intel/events/data/fetch";
import { EVENT_UI_QUERIES } from "@/features/intel/events/data/uiQueries";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import {
  EntityLifetime,
  GeoCarrier,
  StationaryGeoDataSource,
  type SourcePolicy,
} from "@/workers/data/source-model/dataSource";
import { recordPosition } from "@/workers/data/source-model/position";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import { Domain } from "@shared/domain/identity";
import { SourceCompletenessPolicy } from "@shared/domain/sourcePolicy";
import { geoPointsEqual } from "@shared/geo";
import {
  DAYS_PER_WEEK,
  MS_PER_DAY,
} from "@shared/time";
import { SourceCompleteness } from "@shared/source";

export function eventWindowDurationMs(): number {
  return DAYS_PER_WEEK * MS_PER_DAY;
}

export const EVENT_SOURCE_POLICY: SourcePolicy = {
  id: Domain.Events,
  cacheKey: CACHE_KEYS.events,
  pollIntervalMs: POLL_INTERVALS.events,
  completeness: SourceCompletenessPolicy.Partial,
  emptyResultIsComplete: false,
};

export type EventSourceOptions = Readonly<{
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<EventPoint>>;
  now?: () => number;
}>;

function publishedAt(point: EventPoint): number {
  const parsed = point.timestamp ? Date.parse(point.timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeEventWindow(
  retained: readonly EventPoint[],
  incoming: readonly EventPoint[],
  now: number,
): EventPoint[] {
  const cutoff = now - eventWindowDurationMs();
  const byId = new Map<string, EventPoint>();
  for (const point of retained) {
    if (publishedAt(point) >= cutoff) byId.set(point.id, point);
  }
  for (const point of incoming) byId.set(point.id, point);
  return [...byId.values()];
}

export class EventSource extends StationaryGeoDataSource<EventPoint> {
  readonly policy = EVENT_SOURCE_POLICY;
  readonly carrier = GeoCarrier.Position;
  readonly lifetime = EntityLifetime.Ephemeral;
  readonly pointType = Domain.Events;
  readonly queries = EVENT_UI_QUERIES;

  private readonly fetchOverride:
    | (() => Promise<PointSourceFetchSnapshot<EventPoint>>)
    | null;
  private readonly now: () => number;

  constructor(options: EventSourceOptions = {}) {
    super();
    this.fetchOverride = options.fetchSnapshot ?? null;
    this.now = options.now ?? Date.now;
  }

  protected parseCache(value: unknown): readonly EventPoint[] | null {
    return parseEventCache(value);
  }

  protected async fetchSnapshot(): Promise<
    PointSourceFetchSnapshot<EventPoint>
  > {
    const snapshot = this.fetchOverride
      ? await this.fetchOverride()
      : await fetchEventSnapshot(this.now);
    return {
      completeness: SourceCompleteness.Complete,
      entities: mergeEventWindow(
        this.values(),
        snapshot.entities,
        snapshot.observedAt,
      ),
      observedAt: snapshot.observedAt,
    };
  }

  protected hasChanged(
    previous: EventPoint,
    next: EventPoint,
  ): boolean {
    return (
      !geoPointsEqual(recordPosition(previous), recordPosition(next)) ||
      previous.timestamp !== next.timestamp ||
      previous.data.severity !== next.data.severity ||
      previous.data.headline !== next.data.headline
    );
  }
}
