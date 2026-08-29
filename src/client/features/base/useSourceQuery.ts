import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Domain } from "@shared/domain/identity";
import {
  getDataWorkerClient,
  type DataWorkerClient,
} from "@/lib/cache/dataWorkerClient";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import {
  QUERYABLE_SOURCE_CODECS,
  type QueryableSourceEntities,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";
import type { PointUiQuery, PointUiQueryResult } from "@/workers/data/uiQuery";

type SourceResult<TId extends QueryableSourceId> = PointUiQueryResult<
  QueryableSourceEntities[TId]
>;

export type SourceQueryRequest = (
  source: QueryableSourceId,
) => PointUiQuery | null;

export type SourceQueryResults = Readonly<{
  [TId in QueryableSourceId]: SourceResult<TId> | null;
}>;

type QueryState<TId extends QueryableSourceId> = Readonly<{
  key: string;
  sourceVersion: number;
  result: SourceResult<TId>;
}>;

function subscribe(
  client: DataWorkerClient | null,
  source: QueryableSourceId | null,
  onStoreChange: () => void,
): () => void {
  if (!source) return () => undefined;
  return client?.subscribeSource(source, onStoreChange) ?? (() => undefined);
}

/**
 * Status and count for a source, pushed from the DataWorker. A null source
 * subscribes to nothing, so a caller whose source depends on state can still
 * call this unconditionally.
 */
export function useSourceSnapshot(
  source: QueryableSourceId | null,
): DataWorkerSourceSnapshot | null {
  const client = useMemo(getDataWorkerClient, []);
  return useSyncExternalStore(
    (onStoreChange) => subscribe(client, source, onStoreChange),
    () => (source ? (client?.getSourceSnapshot(source) ?? null) : null),
    () => null,
  );
}

/**
 * A bounded page of one source, recomputed in the worker whenever the query
 * or the source version changes. The last page for the current query keeps
 * being served while a newer one is in flight, so a poll or a slow worker
 * never blanks a count the UI already has.
 */
export function useSourceQuery<TId extends QueryableSourceId>(
  source: TId,
  query: PointUiQuery | null,
): SourceResult<TId> | null {
  const client = useMemo(getDataWorkerClient, []);
  const snapshot = useSourceSnapshot(query ? source : null);
  const queryKey = query ? JSON.stringify(query) : null;
  const [state, setState] = useState<QueryState<TId> | null>(null);

  useEffect(() => {
    if (!client || !query || !queryKey || !snapshot) return;
    let cancelled = false;
    client
      .querySource({ source, query })
      .then((response) => {
        if (cancelled || response.source !== source) return;
        // Re-parsed rather than narrowed: the reply union cannot be narrowed
        // by a generic source id, and a page is bounded so it is cheap.
        const result = QUERYABLE_SOURCE_CODECS[source].parseResult(
          response.result,
        );
        if (result) {
          setState({
            key: queryKey,
            sourceVersion: response.sourceVersion,
            result,
          });
        }
      })
      .catch((error_: unknown) => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, source, queryKey, snapshot?.version]);

  if (!queryKey || state?.key !== queryKey) return null;
  return state.result;
}

function useRequestedSourceQuery<TId extends QueryableSourceId>(
  source: TId,
  request: SourceQueryRequest,
): SourceResult<TId> | null {
  return useSourceQuery(source, request(source));
}

export function useSourceQueries(
  request: SourceQueryRequest,
): SourceQueryResults {
  const aircraft = useRequestedSourceQuery(Domain.Aircraft, request);
  const cyclones = useRequestedSourceQuery(Domain.Cyclones, request);
  const cycloneWarnings = useRequestedSourceQuery(
    Domain.CycloneWarnings,
    request,
  );
  const earthquake = useRequestedSourceQuery(Domain.Earthquake, request);
  const events = useRequestedSourceQuery(Domain.Events, request);
  const fire = useRequestedSourceQuery(Domain.Fire, request);
  const ships = useRequestedSourceQuery(Domain.Ships, request);
  const weather = useRequestedSourceQuery(Domain.Weather, request);

  return useMemo<SourceQueryResults>(
    () => ({
      [Domain.Aircraft]: aircraft,
      [Domain.Cyclones]: cyclones,
      [Domain.CycloneWarnings]: cycloneWarnings,
      [Domain.Earthquake]: earthquake,
      [Domain.Events]: events,
      [Domain.Fire]: fire,
      [Domain.Ships]: ships,
      [Domain.Weather]: weather,
    }),
    [
      aircraft,
      cycloneWarnings,
      cyclones,
      earthquake,
      events,
      fire,
      ships,
      weather,
    ],
  );
}
