// ── useCycloneModels ─────────────────────────────────────────────────
// Lazy "spaghetti" model guidance: the a-deck is large, so it's fetched only
// when the MODELS toggle is on (and the storm is open) — never with the storm
// feed. Server caches + revalidates it (conditional GET); this just pulls it.

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/authService";
import type { ModelTrack } from "../types";

export function useCycloneModels(
  stormId: string,
  enabled: boolean,
): ModelTrack[] {
  const [models, setModels] = useState<ModelTrack[]>([]);

  useEffect(() => {
    if (!enabled) {
      setModels([]);
      return;
    }
    let cancelled = false;
    authenticatedFetch(`/api/cyclones/${stormId}/models`)
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((j) => {
        if (!cancelled) setModels(Array.isArray(j.models) ? j.models : []);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [stormId, enabled]);

  return models;
}
