import { useMemo } from "react";
import {
  useProviderData,
  type ProviderDataSource,
} from "@/features/base/useProviderData";
import { cycloneProvider } from "../data/provider";
import { synthesizeForecastPoints } from "../data/synthesizeForecastPoints";

export type CycloneDataSource = ProviderDataSource;

/**
 * Subscribe to the cyclone provider. Default poll is 30 minutes —
 * NHC publishes regular advisories every 6h with intermediate updates
 * every 3h. 30 min keeps the UI responsive without burning capacity.
 *
 * Returned `data` is the cyclone DataPoints PLUS synthetic
 * "cyclones-forecast" DataPoints — one per forecast track point per
 * storm. Synthesis happens here so every consumer (DataContext,
 * spatial grid, hit-test, dossier dispatcher) sees a single flat
 * stream and the click pipeline picks up forecast points naturally
 * with no extra wiring.
 */
export function useCycloneData(pollInterval: number = 30 * 60_000) {
  const result = useProviderData(cycloneProvider, pollInterval);

  // Gate the combined array on the identities of (data, forecastPoints), not
  // on result.version — a same-content poll must return the SAME array so
  // allData doesn't churn the render worker. synthesizeForecastPoints is
  // content-keyed and stable, so this only news an array when content changes.
  const forecastPoints = synthesizeForecastPoints(result.data);
  const data = useMemo(() => {
    if (forecastPoints.length === 0) return result.data;
    return [...result.data, ...forecastPoints];
  }, [result.data, forecastPoints]);
  return { ...result, data };
}
