// ── useCycloneDossier ───────────────────────────────────────────────
// Lazy-loads NHC text products (Public Advisory + Forecast Discussion +
// Wind Speed Probabilities) for the currently-selected cyclone. Server
// already caches the bundle for 60 minutes; this hook caches for the
// same window in IndexedDB so a quick re-select doesn't re-roundtrip.
//
// The hook returns `{ dossier, loading, error }`. `dossier === null`
// means the storm wasn't registered in CurrentStorms.json (e.g. the
// stormId fell out of the active list); the dossier UI hides the
// ADVISORY / DISCUSSION sections in that case rather than rendering a
// confusing "loading…" spinner.

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/authService";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

export type DossierProductBody = {
  advisoryNumber: string;
  issuedAt: string;
  body: string;
  /** NHC's published next-advisory time, verbatim. "" if absent. */
  nextAdvisory: string;
};

export type CycloneDossierBundle = {
  stormId: string;
  advisory?: DossierProductBody;
  discussion?: DossierProductBody;
  windProbs?: DossierProductBody;
};

type IdbEntry = {
  bundle: CycloneDossierBundle | null;
  fetchedAt: number;
};

const CLIENT_TTL_MS = 60 * 60_000;
const STORM_ID_RE = /^(?:AL|EP|CP)\d{2}\d{4}$/i;

function idbKey(stormId: string): string {
  return `${CACHE_KEYS.cycloneDossier}.${stormId.toUpperCase()}`;
}

type UseCycloneDossierResult = {
  dossier: CycloneDossierBundle | null;
  loading: boolean;
  error: Error | null;
};

export function useCycloneDossier(
  stormId: string | null | undefined,
): UseCycloneDossierResult {
  const [dossier, setDossier] = useState<CycloneDossierBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!stormId) {
      setDossier(null);
      setLoading(false);
      setError(null);
      return;
    }
    const normalized = stormId.toUpperCase();
    if (!STORM_ID_RE.test(normalized)) {
      setDossier(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      // Fast path — but only a non-null cached bundle. A persisted null must
      // not stick for the TTL; fall through so a recovered server fills it in.
      const cached = await cacheGet<IdbEntry>(idbKey(normalized));
      if (cancelled) return;
      const fresh =
        cached?.bundle && Date.now() - cached.fetchedAt < CLIENT_TTL_MS
          ? cached
          : null;
      if (fresh) {
        setDossier(fresh.bundle);
        setLoading(false);
        return;
      }
      // Network path: hit the server cache.
      try {
        const res = await authenticatedFetch(
          `/api/dossier/cyclone/${encodeURIComponent(normalized)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(`Cyclone dossier API error: ${res.status}`);
        }
        const json = (await res.json()) as {
          dossier: CycloneDossierBundle | null;
          fetchedAt: number;
        };
        if (cancelled) return;
        setDossier(json.dossier);
        setLoading(false);
        // Persist only a real bundle — caching null re-creates the sticking.
        if (json.dossier) {
          await cacheSet(idbKey(normalized), {
            bundle: json.dossier,
            fetchedAt: Date.now(),
          });
        }
      } catch (err) {
        if (cancelled) return;
        // On error, fall back to whatever IDB had (even if stale) — a
        // 24-hour-old advisory is still more useful than nothing.
        setDossier(cached?.bundle ?? null);
        setError(err instanceof Error ? err : new Error("Unknown error"));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stormId]);

  return { dossier, loading, error };
}
