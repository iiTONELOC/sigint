import { useEffect, useMemo, useState } from "react";
import {
  AIRCRAFT_DOSSIER_REFRESH_MS,
  type AircraftDossierBundle,
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
    const load = () => {
      client.getAircraftDossier(entityId).then(
        (dossier) => {
          if (active) setState({ entityId, dossier });
        },
        () => {
          if (active) setState((current) => current?.entityId === entityId ? current : { entityId, dossier: null });
        },
      );
    };
    load();
    const refresh = setInterval(load, AIRCRAFT_DOSSIER_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(refresh);
    };
  }, [client, entityId, requestKey]);

  return state?.entityId === entityId ? state.dossier : null;
}
