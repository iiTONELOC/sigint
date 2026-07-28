import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
 * or the source version changes. Null while a result is in flight or stale,
 * so callers never render a page that belongs to a different version.
 */
export function useSourceQuery<TId extends QueryableSourceId>(
  source: TId,
  query: PointUiQuery | null,
): SourceResult<TId> | null {
  const client = useMemo(getDataWorkerClient, []);
  const snapshot = useSourceSnapshot(source);
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
          setState({ key: queryKey, sourceVersion: response.sourceVersion, result });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, source, queryKey, snapshot?.version]);

  if (!queryKey || state?.key !== queryKey) return null;
  if (snapshot && state.sourceVersion !== snapshot.version) return null;
  return state.result;
}
