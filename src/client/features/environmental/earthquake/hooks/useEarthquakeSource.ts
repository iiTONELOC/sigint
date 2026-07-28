import {
  useSourceQuery,
  useSourceSnapshot,
} from "@/features/base/useSourceQuery";
import type {
  EarthquakeUiQuery,
  EarthquakeUiQueryResult,
} from "@/features/environmental/earthquake/data/uiQueries";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";

export function useEarthquakeSourceSnapshot(): DataWorkerSourceSnapshot | null {
  return useSourceSnapshot("earthquake");
}

export function useEarthquakeUiQuery(
  query: EarthquakeUiQuery | null,
): EarthquakeUiQueryResult | null {
  return useSourceQuery("earthquake", query);
}
