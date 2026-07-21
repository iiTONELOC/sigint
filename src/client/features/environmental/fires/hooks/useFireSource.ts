import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  FireUiQuery,
  FireUiQueryResult,
} from "@/features/environmental/fires/data/uiQueries";
import {
  getDataWorkerClient,
  type DataWorkerClient,
} from "@/lib/cache/dataWorkerClient";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";

type FireQueryState = Readonly<{
  key: string;
  sourceVersion: number;
  result: FireUiQueryResult;
}>;

function subscribeToSource(
  client: DataWorkerClient | null,
  onStoreChange: () => void,
): () => void {
  return client?.subscribeSource("fire", onStoreChange) ?? (() => undefined);
}

export function useFireSourceSnapshot(): DataWorkerSourceSnapshot | null {
  const client = useMemo(getDataWorkerClient, []);
  return useSyncExternalStore(
    (onStoreChange) => subscribeToSource(client, onStoreChange),
    () => client?.getSourceSnapshot("fire") ?? null,
    () => null,
  );
}

export function useFireUiQuery(
  query: FireUiQuery | null,
): FireUiQueryResult | null {
  const client = useMemo(getDataWorkerClient, []);
  const source = useFireSourceSnapshot();
  const queryKey = query ? JSON.stringify(query) : null;
  const [state, setState] = useState<FireQueryState | null>(null);

  useEffect(() => {
    if (!client || !query || !queryKey || !source) return;
    let cancelled = false;
    void client
      .querySource({ source: "fire", query })
      .then((response) => {
        if (cancelled || response.source !== "fire") return;
        setState({
          key: queryKey,
          sourceVersion: response.sourceVersion,
          result: response.result,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, queryKey, source?.version]);

  if (!queryKey || state?.key !== queryKey) return null;
  if (source && state.sourceVersion !== source.version) return null;
  return state.result;
}
