import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/net/authService";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";

export type DossierProductBody = Readonly<{
  readonly advisoryNumber: string;
  readonly issuedAt: string;
  readonly body: string;
  /** NHC's published next-advisory time, verbatim. "" if absent. */
  readonly nextAdvisory: string;
}>;

export type CycloneDossierBundle = Readonly<{
  readonly stormId: string;
  readonly advisory?: DossierProductBody;
  readonly discussion?: DossierProductBody;
  readonly windProbs?: DossierProductBody;
}>;

type IdbEntry = Readonly<{
  readonly bundle: CycloneDossierBundle | null;
  readonly fetchedAt: number;
}>;

const STORM_ID_RE = /^(?:AL|EP|CP)\d{2}\d{4}$/i;

enum CycloneDossierEndpoint {
  Cyclone = "/api/dossier/cyclone/",
}

enum CycloneDossierTiming {
  ClientCacheMs = 3_600_000,
}

enum CycloneDossierErrorKind {
  RequestRejected = "The cyclone dossier request failed",
  Unknown = "The cyclone dossier failed for an unknown reason",
}

class CycloneDossierError extends Error {
  constructor(
    readonly kind: CycloneDossierErrorKind,
    readonly httpStatus: number | null = null,
  ) {
    super(kind);
    this.name = CycloneDossierError.name;
  }
}

function idbKey(stormId: string): string {
  return `${CacheKey.CycloneDossier}.${stormId.toUpperCase()}`;
}

type UseCycloneDossierResult = Readonly<{
  readonly dossier: CycloneDossierBundle | null;
  readonly loading: boolean;
  readonly error: Error | null;
}>;

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
    (async () => {
      // A null cache entry must not block a recovered server response.
      const cached = await cacheGet<IdbEntry>(idbKey(normalized));
      if (cancelled) return;
      const fresh =
        cached?.bundle &&
        Date.now() - cached.fetchedAt < CycloneDossierTiming.ClientCacheMs
          ? cached
          : null;
      if (fresh) {
        setDossier(fresh.bundle);
        setLoading(false);
        return;
      }
      try {
        const res = await authenticatedFetch(
          `${CycloneDossierEndpoint.Cyclone}${encodeURIComponent(normalized)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          throw new CycloneDossierError(
            CycloneDossierErrorKind.RequestRejected,
            res.status,
          );
        }
        const json = (await res.json()) as {
          dossier: CycloneDossierBundle | null;
          fetchedAt: number;
        };
        if (cancelled) return;
        setDossier(json.dossier);
        setLoading(false);
        // A null entry would hide a later recovery for the full cache period.
        if (json.dossier) {
          await cacheSet(idbKey(normalized), {
            bundle: json.dossier,
            fetchedAt: Date.now(),
          });
        }
      } catch (err) {
        if (cancelled) return;
        // A stale advisory is more useful than an empty dossier.
        setDossier(cached?.bundle ?? null);
        setError(
          err instanceof Error
            ? err
            : new CycloneDossierError(CycloneDossierErrorKind.Unknown),
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stormId]);

  return { dossier, loading, error };
}
