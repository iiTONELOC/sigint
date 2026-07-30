import { EARTHQUAKE_UI_QUERIES } from "@/features/environmental/earthquake/data/uiQueries";
import { Domain } from "@shared/domain/identity";
import { FIRE_UI_QUERIES } from "@/features/environmental/fires/data/uiQueries";
import { WEATHER_UI_QUERIES } from "@/features/environmental/weather/data/uiQueries";
import { CYCLONE_UI_QUERIES } from "@/features/environmental/cyclones/data/uiQueries";
import { CYCLONE_WARNING_UI_QUERIES } from "@/features/environmental/cyclones/data/warningUiQueries";
import { EVENT_UI_QUERIES } from "@/features/intel/events/data/uiQueries";
import { AIRCRAFT_UI_QUERIES } from "@/features/tracking/aircraft/data/uiQueries";
import { SHIP_UI_QUERIES } from "@/features/tracking/ships/data/uiQueries";
import type { EarthquakePoint } from "@/features/environmental/earthquake/data/source";
import type { FirePoint } from "@/features/environmental/fires/data/source";
import type { WeatherPoint } from "@/features/environmental/weather/types";
import type { CyclonePoint } from "@/features/environmental/cyclones/data/codec";
import type { CycloneWarningPoint } from "@/features/environmental/cyclones/types";
import type { EventPoint } from "@/features/intel/events/data/codec";
import type { AircraftPoint } from "@/features/tracking/aircraft/data/codec";
import type { ShipPoint } from "@/features/tracking/ships/data/codec";
import type { DataPoint } from "@/features/base/dataPoints";
import type {
  PointUiQueries,
  PointUiQuery,
  PointUiQueryResult,
} from "@/workers/data/uiQuery";
import type {
  DataWorkerCommand,
  DataWorkerEnvelope,
  DataWorkerEvent,
} from "@/workers/data/protocol";
import { DataWorkerMessageType } from "@/workers/data/messageType";

/**
 * The one place a source becomes queryable. Adding a source is an entry here
 * plus a descriptor; every command, event and client union is generated from
 * this map.
 */
export type QueryableSourceEntities = {
  [Domain.Aircraft]: AircraftPoint;
  [Domain.Cyclones]: CyclonePoint;
  [Domain.CycloneWarnings]: CycloneWarningPoint;
  [Domain.Earthquake]: EarthquakePoint;
  [Domain.Events]: EventPoint;
  [Domain.Fire]: FirePoint;
  [Domain.Ships]: ShipPoint;
  [Domain.Weather]: WeatherPoint;
};

export type QueryableSourceId = keyof QueryableSourceEntities;

export type QueryableSourceShapes = {
  [TId in QueryableSourceId]: {
    query: PointUiQuery;
    result: PointUiQueryResult<QueryableSourceEntities[TId]>;
    entity: QueryableSourceEntities[TId];
  };
};

const QUERIES: {
  [TId in QueryableSourceId]: PointUiQueries<QueryableSourceEntities[TId]>;
} = {
  [Domain.Aircraft]: AIRCRAFT_UI_QUERIES,
  [Domain.Cyclones]: CYCLONE_UI_QUERIES,
  [Domain.CycloneWarnings]: CYCLONE_WARNING_UI_QUERIES,
  [Domain.Earthquake]: EARTHQUAKE_UI_QUERIES,
  [Domain.Events]: EVENT_UI_QUERIES,
  [Domain.Fire]: FIRE_UI_QUERIES,
  [Domain.Ships]: SHIP_UI_QUERIES,
  [Domain.Weather]: WEATHER_UI_QUERIES,
};

export type QueryableSourceCodec<TId extends QueryableSourceId> = Readonly<{
  parseEntity: (value: unknown) => QueryableSourceEntities[TId] | null;
  parseResult: (
    value: unknown,
  ) => PointUiQueryResult<QueryableSourceEntities[TId]> | null;
  buildQueryCommand: (
    envelope: DataWorkerEnvelope,
    rawQuery: unknown,
  ) => DataWorkerCommand | null;
  buildEntityEvent: (
    envelope: DataWorkerEnvelope,
    sourceVersion: number,
    rawValue: unknown,
  ) => DataWorkerEvent | null;
  buildQueryEvent: (
    envelope: DataWorkerEnvelope,
    sourceVersion: number,
    rawResult: unknown,
  ) => DataWorkerEvent | null;
}>;

type QueryableSourceCodecs = {
  [TId in QueryableSourceId]: QueryableSourceCodec<TId>;
};

/**
 * Binds one source's queries to its command and event shapes. The reply names
 * the source beside the payload rather than correlating the two, so this stays
 * generic and no source needs a builder of its own.
 */
function codecFor<TId extends QueryableSourceId>(
  source: TId,
  queries: PointUiQueries<QueryableSourceEntities[TId]>,
): QueryableSourceCodec<TId> {
  return {
    parseEntity: queries.descriptor.parseEntity,
    parseResult: queries.parseResult,
    buildQueryCommand: (envelope, rawQuery) => {
      const query = queries.parseQuery(rawQuery);
      return query
        ? {
            ...envelope,
            type: DataWorkerMessageType.QuerySource,
            source,
            query,
          }
        : null;
    },
    buildEntityEvent: (envelope, sourceVersion, rawValue) => {
      if (rawValue === null) {
        return {
          ...envelope,
          type: DataWorkerMessageType.SourceEntity,
          source,
          sourceVersion,
          value: null,
        };
      }
      const value = queries.descriptor.parseEntity(rawValue);
      return value
        ? {
            ...envelope,
            type: DataWorkerMessageType.SourceEntity,
            source,
            sourceVersion,
            value,
          }
        : null;
    },
    buildQueryEvent: (envelope, sourceVersion, rawResult) => {
      const result = queries.parseResult(rawResult);
      return result
        ? {
            ...envelope,
            type: DataWorkerMessageType.SourceQuery,
            source,
            sourceVersion,
            result,
          }
        : null;
    },
  };
}

export const QUERYABLE_SOURCE_CODECS: QueryableSourceCodecs = {
  [Domain.Aircraft]: codecFor(Domain.Aircraft, QUERIES.aircraft),
  [Domain.Cyclones]: codecFor(Domain.Cyclones, QUERIES.cyclones),
  [Domain.CycloneWarnings]: codecFor(
    Domain.CycloneWarnings,
    QUERIES.cycloneWarnings,
  ),
  [Domain.Earthquake]: codecFor(Domain.Earthquake, QUERIES.earthquake),
  [Domain.Events]: codecFor(Domain.Events, QUERIES.events),
  [Domain.Fire]: codecFor(Domain.Fire, QUERIES.fire),
  [Domain.Ships]: codecFor(Domain.Ships, QUERIES.ships),
  [Domain.Weather]: codecFor(Domain.Weather, QUERIES.weather),
};

export const QUERYABLE_SOURCE_IDS = Object.keys(
  QUERYABLE_SOURCE_CODECS,
) as readonly QueryableSourceId[];

export function isQueryableSourceId(
  value: unknown,
): value is QueryableSourceId {
  return (
    typeof value === "string" &&
    Object.hasOwn(QUERYABLE_SOURCE_CODECS, value)
  );
}

/**
 * Validates a whole source list at a worker boundary. The codec is picked at
 * run time, so the result widens to DataPoint; every entity type is one.
 */
export function parseQueryableSourceList(
  source: QueryableSourceId,
  value: unknown,
): readonly DataPoint[] | null {
  if (!Array.isArray(value)) return null;
  const { parseEntity } = QUERYABLE_SOURCE_CODECS[source];
  const points: DataPoint[] = [];
  for (const candidate of value) {
    const point = parseEntity(candidate);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

export function findQueryableSearchIds<TId extends QueryableSourceId>(
  source: TId,
  points: readonly QueryableSourceEntities[TId][],
  text: string,
): string[] {
  return QUERIES[source].findSearchIds(points, text);
}

/** The part of a source runtime the query handlers need. */
export type QueryableOwner<TEntity> = Readonly<{
  get: (id: string) => TEntity | null;
  values: () => readonly TEntity[];
  snapshot: () => Readonly<{ version: number }>;
}>;

export type SourceAnswers = Readonly<{
  entity: (
    envelope: DataWorkerEnvelope,
    id: string,
  ) => DataWorkerEvent | null;
  query: (
    envelope: DataWorkerEnvelope,
    query: PointUiQuery,
  ) => DataWorkerEvent | null;
}>;

/**
 * Binds a source's codec to its owner once, so the worker's handlers can
 * answer any source without knowing which one they are holding.
 */
export function createSourceAnswers<TId extends QueryableSourceId>(
  source: TId,
  owner: QueryableOwner<QueryableSourceEntities[TId]>,
): SourceAnswers {
  const codec = QUERYABLE_SOURCE_CODECS[source];
  return {
    entity: (envelope, id) =>
      codec.buildEntityEvent(
        envelope,
        owner.snapshot().version,
        owner.get(id),
      ),
    query: (envelope, query) =>
      codec.buildQueryEvent(
        envelope,
        owner.snapshot().version,
        QUERIES[source].run(owner.values(), query),
      ),
  };
}
