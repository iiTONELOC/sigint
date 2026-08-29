import { describe, expect, mock, test } from "bun:test";
import { act, useState } from "react";
import type { AircraftPoint } from "@shared/domain/aircraft";
import type {
  AircraftDossier,
} from "@shared/domain/aircraftDossier";
import { Domain } from "@shared/domain/identity";
import { renderHook } from "../../../../../support/react";

enum AircraftDossierHookFixture {
  EntityId = "aircraft-a",
  InitialIcao24 = "abc123",
  RefreshedIcao24 = "def456",
}

enum AircraftDossierHookCount {
  InitialRequest = 1,
  RefreshRequest = 2,
}

let requestCount = 0;
const refreshGate = Promise.withResolvers<void>();
const initialDossier = dossier(AircraftDossierHookFixture.InitialIcao24);
const refreshedDossier = dossier(
  AircraftDossierHookFixture.RefreshedIcao24,
);

function dossier(icao24: string): AircraftDossier {
  return { icao24, aircraft: null, route: null };
}

mock.module("@/lib/cache/dataWorkerClient", () => ({
  getDataWorkerClient: () => ({
    getAircraftDossier: async (): Promise<AircraftDossier> => {
      requestCount += AircraftDossierHookCount.InitialRequest;
      if (requestCount === AircraftDossierHookCount.InitialRequest) {
        return initialDossier;
      }
      await refreshGate.promise;
      return refreshedDossier;
    },
  }),
}));

const { useAircraftDossier } = await import(
  "@/features/tracking/aircraft/hooks/useAircraftDossier"
);

describe("useAircraftDossier", () => {
  test("keeps the current dossier while refreshed data loads", async () => {
    const { result, waitFor } = renderHook(() => {
      const [requestKey, setRequestKey] = useState<AircraftPoint>({
        id: AircraftDossierHookFixture.EntityId,
        type: Domain.Aircraft,
        position: [0, 0],
        data: { icao24: AircraftDossierHookFixture.InitialIcao24 },
      });
      return {
        dossier: useAircraftDossier(
          AircraftDossierHookFixture.EntityId,
          requestKey,
        ),
        refresh: () => {
          setRequestKey((current) => ({
            ...current,
            data: {
              ...current.data,
              icao24: AircraftDossierHookFixture.RefreshedIcao24,
            },
          }));
        },
      };
    });

    await waitFor(() => result.current.dossier === initialDossier);

    act(result.current.refresh);
    await waitFor(
      () => requestCount === AircraftDossierHookCount.RefreshRequest,
    );

    expect(result.current.dossier).toBe(initialDossier);

    await act(async () => {
      refreshGate.resolve();
      await refreshGate.promise;
    });
    await waitFor(() => result.current.dossier === refreshedDossier);
  });
});
