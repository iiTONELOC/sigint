import {
  parseEarthquakePoint,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import {
  parseEarthquakeUiQuery,
  parseEarthquakeUiQueryResult,
  type EarthquakeUiQuery,
  type EarthquakeUiQueryResult,
} from "@/features/environmental/earthquake/data/uiQueries";
import {
  parseFirePoint,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import {
  parseFireUiQuery,
  parseFireUiQueryResult,
  type FireUiQuery,
  type FireUiQueryResult,
} from "@/features/environmental/fires/data/uiQueries";
import type { ShipPoint } from "@/features/tracking/ships/data/codec";
import {
  SHIP_UI_QUERY,
  parseShipUiQuery,
  parseShipUiQueryResult,
  type ShipUiQuery,
  type ShipUiQueryResult,
} from "@/features/tracking/ships/data/uiQueries";
import type {
  DataWorkerCommand,
  DataWorkerEnvelope,
  DataWorkerEvent,
} from "@/workers/data/protocol";

export type QueryableSourceShapes = {
  earthquake: {
    query: EarthquakeUiQuery;
    result: EarthquakeUiQueryResult;
    entity: EarthquakePoint;
  };
  fire: {
    query: FireUiQuery;
    result: FireUiQueryResult;
    entity: FirePoint;
  };
  ships: {
    query: ShipUiQuery;
    result: ShipUiQueryResult;
    entity: ShipPoint;
  };
};

export type QueryableSourceId = keyof QueryableSourceShapes;

export type QueryableSourceCodec<TId extends QueryableSourceId> = Readonly<{
  parseEntity: (value: unknown) => QueryableSourceShapes[TId]["entity"] | null;
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

export const QUERYABLE_SOURCE_CODECS: QueryableSourceCodecs = {
  earthquake: {
    parseEntity: parseEarthquakePoint,
    buildQueryCommand: (envelope, rawQuery) => {
      const query = parseEarthquakeUiQuery(rawQuery);
      return query
        ? { ...envelope, type: "querySource", source: "earthquake", query }
        : null;
    },
    buildEntityEvent: (envelope, sourceVersion, rawValue) => {
      if (rawValue === null) {
        return {
          ...envelope,
          type: "sourceEntity",
          source: "earthquake",
          sourceVersion,
          value: null,
        };
      }
      const value = parseEarthquakePoint(rawValue);
      return value
        ? {
            ...envelope,
            type: "sourceEntity",
            source: "earthquake",
            sourceVersion,
            value,
          }
        : null;
    },
    buildQueryEvent: (envelope, sourceVersion, rawResult) => {
      const result = parseEarthquakeUiQueryResult(rawResult);
      return result
        ? {
            ...envelope,
            type: "sourceQuery",
            source: "earthquake",
            sourceVersion,
            result,
          }
        : null;
    },
  },

  fire: {
    parseEntity: parseFirePoint,
    buildQueryCommand: (envelope, rawQuery) => {
      const query = parseFireUiQuery(rawQuery);
      return query
        ? { ...envelope, type: "querySource", source: "fire", query }
        : null;
    },
    buildEntityEvent: (envelope, sourceVersion, rawValue) => {
      if (rawValue === null) {
        return {
          ...envelope,
          type: "sourceEntity",
          source: "fire",
          sourceVersion,
          value: null,
        };
      }
      const value = parseFirePoint(rawValue);
      return value
        ? {
            ...envelope,
            type: "sourceEntity",
            source: "fire",
            sourceVersion,
            value,
          }
        : null;
    },
    buildQueryEvent: (envelope, sourceVersion, rawResult) => {
      const result = parseFireUiQueryResult(rawResult);
      return result
        ? {
            ...envelope,
            type: "sourceQuery",
            source: "fire",
            sourceVersion,
            result,
          }
        : null;
    },
  },

  ships: {
    parseEntity: SHIP_UI_QUERY.parseEntity,
    buildQueryCommand: (envelope, rawQuery) => {
      const query = parseShipUiQuery(rawQuery);
      return query
        ? { ...envelope, type: "querySource", source: "ships", query }
        : null;
    },
    buildEntityEvent: (envelope, sourceVersion, rawValue) => {
      if (rawValue === null) {
        return {
          ...envelope,
          type: "sourceEntity",
          source: "ships",
          sourceVersion,
          value: null,
        };
      }
      const value = SHIP_UI_QUERY.parseEntity(rawValue);
      return value
        ? {
            ...envelope,
            type: "sourceEntity",
            source: "ships",
            sourceVersion,
            value,
          }
        : null;
    },
    buildQueryEvent: (envelope, sourceVersion, rawResult) => {
      const result = parseShipUiQueryResult(rawResult);
      return result
        ? {
            ...envelope,
            type: "sourceQuery",
            source: "ships",
            sourceVersion,
            result,
          }
        : null;
    },
  },
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
