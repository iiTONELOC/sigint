import {
  parseEventCache,
  type EventPoint,
} from "@/features/intel/events/data/codec";
import { EVENT_FEED } from "@/features/intel/events/data/fetch";
import {
  pointSceneBinding,
  type SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  GeoCarrier,
  StationaryPointSource,
  feedFetch,
  recordChanged,
  type PointSourceOptions,
} from "@/workers/data/source-model/dataSource";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import { IntelSeverity } from "@shared/domain/correlation";
import type { EventData } from "@shared/domain/events";
import { Domain } from "@shared/domain/identity";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import { EventSceneAttribute } from "@shared/scene";
import { SourceCompleteness } from "@shared/source";
import {
  DAYS_PER_WEEK,
  MS_PER_DAY,
} from "@shared/time";

export function eventWindowDurationMs(): number {
  return DAYS_PER_WEEK * MS_PER_DAY;
}

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

function eventAlertEquals(previous: EventData, next: EventData): boolean {
  return (
    previous.severity === next.severity &&
    previous.headline === next.headline
  );
}

export class EventSource extends StationaryPointSource<
  Domain.Events,
  EventPoint
> {
  constructor(options: PointSourceOptions<EventPoint> = {}) {
    super({
      policy: getPointSourceDefinition(Domain.Events),
      carrier: GeoCarrier.Position,
      parseCache: parseEventCache,
      fetchSnapshot: feedFetch(options, EVENT_FEED),
      hasChanged: recordChanged(eventAlertEquals),
    });
  }

  /** A partial feed lands on the retained seven-day window. */
  protected override async fetchSnapshot(): Promise<
    PointSourceFetchSnapshot<EventPoint>
  > {
    const snapshot = await super.fetchSnapshot();
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
}

export function eventSceneBinding(
  publishScene: SceneCommandPublisher,
): SceneBinding<EventPoint> {
  return pointSceneBinding(publishScene, {
    source: Domain.Events,
    writeAttributes: (point, target, offset) => {
      target[offset + EventSceneAttribute.Severity] =
        point.data.severity ?? IntelSeverity.Monitoring;
    },
  });
}
