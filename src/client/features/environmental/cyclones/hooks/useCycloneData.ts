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
  // Forecast synthesis depends on storm positions, which mutate in place
  // across same-id-set polls (provider preserves array identity). Gate on
  // version too so a new advisory recomputes the synthetic forecast cone
  // even when the active-storm set is unchanged.
  const data = useMemo(
    () => [...result.data, ...synthesizeForecastPoints(result.data)],
    [result.data, result.version],
  );
  return { ...result, data };
}
