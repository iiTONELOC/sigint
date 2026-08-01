import { useEffect, useMemo, useState } from "react";
import { Domain } from "@shared/domain/identity";
import type {
  AircraftDossier,
} from "@shared/domain/aircraftDossier";
import {
  getDataWorkerClient,
} from "@/lib/cache/dataWorkerClient";
import {
  useSourceSnapshot,
} from "@/features/base/useSourceQuery";

type AircraftDossierState = Readonly<{
  entityId: string;
  dossier: AircraftDossier | null;
}>;

export function useAircraftDossier(
  entityId: string,
): AircraftDossier | null {
  const client = useMemo(getDataWorkerClient, []);
  const sourceVersion =
    useSourceSnapshot(Domain.Aircraft)?.version;
  const [state, setState] = useState<AircraftDossierState | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    client.getAircraftDossier(entityId).then(
      (dossier) => {
        if (active) setState({ entityId, dossier });
      },
      () => {
        if (active) setState({ entityId, dossier: null });
      },
    );
    return () => {
      active = false;
    };
  }, [client, entityId, sourceVersion]);

  return state?.entityId === entityId ? state.dossier : null;
}
