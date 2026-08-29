import { useEffect, useMemo, useState } from "react";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import type { CycloneDossierBundle } from "@shared/domain/cyclones";

export function useCycloneDossier(
  entityId: string | null | undefined,
): Readonly<{ dossier: CycloneDossierBundle | null; loading: boolean }> {
  const client = useMemo(getDataWorkerClient, []);
  const [state, setState] = useState<Readonly<{
    entityId: string;
    dossier: CycloneDossierBundle | null;
  }> | null>(null);

  useEffect(() => {
    if (!client || !entityId) {
      setState(null);
      return;
    }
    let active = true;
    setState(null);
    void client.getCycloneDossier(entityId)
      .catch(() => null)
      .then((dossier) => {
        if (active) setState({ entityId, dossier });
      });
    return () => {
      active = false;
    };
  }, [client, entityId]);

  if (state && state.entityId === entityId) {
    return { dossier: state.dossier, loading: false };
  }
  return { dossier: null, loading: Boolean(client && entityId) };
}
