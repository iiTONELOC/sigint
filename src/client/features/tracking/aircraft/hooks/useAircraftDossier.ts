import { useEffect, useMemo, useState } from "react";
import type {
  AircraftDossierBundle,
} from "@shared/domain/aircraftDossier";
import type { AircraftPoint } from "@shared/domain/aircraft";
import {
  getDataWorkerClient,
} from "@/lib/cache/dataWorkerClient";

type AircraftDossierState = Readonly<{
  entityId: string;
  dossier: AircraftDossierBundle | null;
}>;

export function useAircraftDossier(
  entityId: string,
  requestKey: AircraftPoint | null,
): AircraftDossierBundle | null {
  const client = useMemo(getDataWorkerClient, []);
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
  }, [client, entityId, requestKey]);

  return state?.entityId === entityId ? state.dossier : null;
}
