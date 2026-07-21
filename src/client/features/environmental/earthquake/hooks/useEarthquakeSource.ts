import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  EarthquakeUiQuery,
  EarthquakeUiQueryResult,
} from "@/features/environmental/earthquake/data/uiQueries";
import {
  getDataWorkerClient,
  type DataWorkerClient,
} from "@/lib/cache/dataWorkerClient";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";

type EarthquakeQueryState = Readonly<{
  key: string;
  sourceVersion: number;
  result: EarthquakeUiQueryResult;
}>;

function subscribeToSource(
  client: DataWorkerClient | null,
  onStoreChange: () => void,
): () => void {
  return client?.subscribeSource("earthquake", onStoreChange) ?? (() => undefined);
}

export function useEarthquakeSourceSnapshot(): DataWorkerSourceSnapshot | null {
  const client = useMemo(getDataWorkerClient, []);
  return useSyncExternalStore(
    (onStoreChange) => subscribeToSource(client, onStoreChange),
    () => client?.getSourceSnapshot("earthquake") ?? null,
    () => null,
  );
}

export function useEarthquakeUiQuery(
  query: EarthquakeUiQuery | null,
): EarthquakeUiQueryResult | null {
  const client = useMemo(getDataWorkerClient, []);
  const source = useEarthquakeSourceSnapshot();
  const queryKey = query ? JSON.stringify(query) : null;
  const [state, setState] = useState<EarthquakeQueryState | null>(null);

  useEffect(() => {
    if (!client || !query || !queryKey || !source) return;
    let cancelled = false;
    void client.querySource("earthquake", query).then((response) => {
      if (cancelled) return;
      setState({
        key: queryKey,
        sourceVersion: response.sourceVersion,
        result: response.result,
      });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, queryKey, source?.version]);

  if (!queryKey || state?.key !== queryKey) return null;
  if (source && state.sourceVersion !== source.version) return null;
  return state.result;
}
