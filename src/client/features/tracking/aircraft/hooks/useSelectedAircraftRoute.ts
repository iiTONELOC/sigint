import { useEffect } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { authenticatedFetch } from "@/lib/net/authService";
import {
  getCachedDossier,
  setCachedDossier,
  type AircraftDossier,
} from "@/panes/dossier/dossierTypes";
import { setSelectedRoute } from "@/lib/runtime/layoutSignals";

// Publishes the selected aircraft's decoded route to layoutSignals so the globe
// can draw it on selection — not just when the dossier pane is open. Single
// publisher: the dossier reads route.waypoints directly for its own map.
export function useSelectedAircraftRoute(selected: DataPoint | null): void {
  const id = selected?.id ?? null;
  const type = selected?.type;
  const data = (
    selected as { data?: { icao24?: string; callsign?: string } } | null
  )?.data;
  const icao24 = data?.icao24;
  const callsign = data?.callsign;

  useEffect(() => {
    if (type !== "aircraft" || !icao24 || !id) {
      setSelectedRoute(null, null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const cacheKey = `${icao24}:${callsign ?? ""}`;

    (async () => {
      try {
        const cached = await getCachedDossier(cacheKey);
        if (cached) {
          if (!cancelled) setSelectedRoute(id, cached.route?.waypoints ?? null);
          return;
        }
        const cs = callsign?.trim();
        const qs = cs ? `?callsign=${encodeURIComponent(cs)}` : "";
        const res = await authenticatedFetch(
          `/api/dossier/aircraft/${icao24.toLowerCase()}${qs}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const { dossier } = (await res.json()) as { dossier: AircraftDossier };
        void setCachedDossier(cacheKey, dossier);
        if (!cancelled) setSelectedRoute(id, dossier.route?.waypoints ?? null);
      } catch {
        /* abort / network — leave the route cleared */
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      setSelectedRoute(null, null);
    };
  }, [id, type, icao24, callsign]);
}
