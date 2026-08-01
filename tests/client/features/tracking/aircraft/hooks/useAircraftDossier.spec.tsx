import { describe, expect, mock, test } from "bun:test";
import { act, useState } from "react";
import type {
  AircraftDossier,
} from "@shared/domain/aircraftDossier";
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

let sourceVersion = AircraftDossierHookCount.InitialRequest;
let requestCount = 0;
const refreshGate = Promise.withResolvers<void>();
const initialDossier = dossier(AircraftDossierHookFixture.InitialIcao24);
const refreshedDossier = dossier(
  AircraftDossierHookFixture.RefreshedIcao24,
);

function dossier(icao24: string): AircraftDossier {
  return { icao24, aircraft: null, route: null };
}

mock.module("@/features/base/useSourceQuery", () => ({
  useSourceSnapshot: () => ({ version: sourceVersion }),
}));

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
      const [, renderSourceVersion] = useState(sourceVersion);
      return {
        dossier: useAircraftDossier(
          AircraftDossierHookFixture.EntityId,
        ),
        refresh: () => {
          sourceVersion += AircraftDossierHookCount.InitialRequest;
          renderSourceVersion(sourceVersion);
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
