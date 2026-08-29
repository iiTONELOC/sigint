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
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import { BLANK_SEPARATOR, nonEmptyText, textOrEmpty } from "@shared/text";
import {
  geometryCentroid,
  isNullIsland,
  isRecord,
  parseGeoJsonPolygonGeometry,
} from "@shared/geo";
import {
  AreaKind,
  CycloneWarningField,
  type CycloneWarningData,
  type CycloneWarningPoint,
} from "@shared/domain/cyclones";

enum WarningPayloadField {
  Features = "features",
  Properties = "properties",
  Id = "id",
  Geometry = "geometry",
}

enum TropicalHazard {
  Hurricane = "hurricane",
  TropicalStorm = "tropical storm",
  StormSurge = "storm surge",
}

const TROPICAL_EVENTS: ReadonlySet<string> = new Set(
  Object.values(TropicalHazard).flatMap((hazard) =>
    Object.values(AreaKind).map((kind) => `${hazard}${BLANK_SEPARATOR}${kind}`),
  ),
);

function kindOf(eventLower: string): AreaKind {
  return eventLower.includes(AreaKind.Warning)
    ? AreaKind.Warning
    : AreaKind.Watch;
}

function warningText(
  properties: Readonly<Record<string, unknown>>,
): Record<CycloneWarningField, string> {
  return {
    [CycloneWarningField.Alert]: textOrEmpty(
      properties[CycloneWarningField.Alert],
    ),
    [CycloneWarningField.Headline]: textOrEmpty(
      properties[CycloneWarningField.Headline],
    ),
    [CycloneWarningField.Area]: textOrEmpty(
      properties[CycloneWarningField.Area],
    ),
    [CycloneWarningField.Effective]: textOrEmpty(
      properties[CycloneWarningField.Effective],
    ),
    [CycloneWarningField.Expires]: textOrEmpty(
      properties[CycloneWarningField.Expires],
    ),
  };
}

class CycloneWarningFeed extends RemoteSource<CycloneWarningPoint> {
  protected readonly transport: SourceTransport = NWS_ALERTS_TRANSPORT;

  protected readonly failureMessages: SourceFailureMessages =
    NWS_SOURCE_FAILURE_MESSAGES[Domain.CycloneWarnings];

  protected readonly completeness: DatasetCompleteness =
    SourceCompleteness.Complete;

  protected items(payload: unknown): readonly unknown[] | null {
    if (!isRecord(payload)) return null;
    const features = payload[WarningPayloadField.Features];
    return Array.isArray(features) ? features : null;
  }

  protected toEntity(
    item: unknown,
    observedAt: number,
  ): CycloneWarningPoint | null {
    if (!isRecord(item)) return null;
    const rawProperties = item[WarningPayloadField.Properties];
    const properties = isRecord(rawProperties) ? rawProperties : {};

    const event = textOrEmpty(properties[CycloneWarningField.Alert]);
    const eventLower = event.toLowerCase();
    if (!TROPICAL_EVENTS.has(eventLower)) return null;

    const geometry = parseGeoJsonPolygonGeometry(
      item[WarningPayloadField.Geometry],
    );
    if (!geometry) return null;

    const position = geometryCentroid(geometry);
    if (!position || isNullIsland(position)) return null;

    const id = nonEmptyText(item[WarningPayloadField.Id]) ?? event;
    const data: CycloneWarningData = {
      ...warningText(properties),
      kind: kindOf(eventLower),
      geometry,
    };
    return {
      id,
      type: Domain.CyclonesWarning,
      position,
      timestamp:
        nonEmptyText(properties[CycloneWarningField.Effective]) ??
        new Date(observedAt).toISOString(),
      data,
    };
  }
}

const CYCLONE_WARNING_FEED = new CycloneWarningFeed();

export function fetchCycloneWarningSnapshot(
  now: () => number = Date.now,
): Promise<PointSourceFetchSnapshot<CycloneWarningPoint>> {
  return CYCLONE_WARNING_FEED.fetchSnapshot(now);
}
