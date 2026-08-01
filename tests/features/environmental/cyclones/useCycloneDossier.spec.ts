/// <reference lib="dom" />
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { useCycloneDossier } from "@/features/environmental/cyclones/hooks/useCycloneDossier";
import { cacheClearAll } from "@/lib/cache/storageService";
import { renderHook } from "../../../support/react";
import {
  installFetchMock,
  type RestoreFetch,
} from "../../../support/network";

enum CycloneDossierFixtureId {
  MalformedInput = "BOGUS-ID",
  RemoteFailure = "AL992024",
  SuccessfulBundle = "AL142024",
}

enum CycloneDossierHttpStatus {
  InternalServerError = 500,
  Ok = 200,
}

// Unique storm identifiers prevent cache writes from crossing test boundaries.
const SAMPLE_BUNDLE = {
  stormId: CycloneDossierFixtureId.SuccessfulBundle,
  advisory: {
    advisoryNumber: "13",
    issuedAt: "400 AM CDT Tue Oct 08 2024",
    body: "...EXTREMELY POWERFUL HURRICANE MILTON...",
  },
  discussion: {
    advisoryNumber: "13",
    issuedAt: "400 AM CDT Tue Oct 08 2024",
    body: "Air Force Hurricane Hunters and NOAA aircraft...",
  },
};

describe("useCycloneDossier", () => {
  let restoreFetch: RestoreFetch;
  let fetchCount: number;
  let lastUrl: string;
  let serverResponse: unknown;
  let serverStatus: CycloneDossierHttpStatus;

  beforeEach(async () => {
    await cacheClearAll();
    fetchCount = 0;
    lastUrl = "";
    serverResponse = { dossier: SAMPLE_BUNDLE, fetchedAt: Date.now() };
    serverStatus = CycloneDossierHttpStatus.Ok;
    restoreFetch = installFetchMock(async (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      lastUrl = url;
      fetchCount += 1;

      return new Response(JSON.stringify(serverResponse), {
        status: serverStatus,
      });
    });
  });

  afterEach(() => {
    restoreFetch();
  });

  test("fetches dossier from /api/dossier/cyclone/:stormId on mount", async () => {
    const { result, waitFor, unmount } = renderHook(() =>
      useCycloneDossier(CycloneDossierFixtureId.SuccessfulBundle),
    );
    await waitFor(() => result.current.dossier !== null);

    expect(result.current.dossier?.stormId).toBe(
      CycloneDossierFixtureId.SuccessfulBundle,
    );
    expect(result.current.dossier?.advisory?.advisoryNumber).toBe("13");
    expect(result.current.loading).toBe(false);
    expect(lastUrl).toContain(
      `/api/dossier/cyclone/${CycloneDossierFixtureId.SuccessfulBundle}`,
    );
    unmount();
  });

  test("returns null and skips fetch when stormId is null", async () => {
    const { result, unmount } = renderHook(() => useCycloneDossier(null));

    expect(result.current.dossier).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fetchCount).toBe(0);
    unmount();
  });

  test("rejects malformed stormId without hitting the network", async () => {
    const { result, unmount } = renderHook(() =>
      useCycloneDossier(CycloneDossierFixtureId.MalformedInput),
    );

    expect(result.current.dossier).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fetchCount).toBe(0);
    unmount();
  });

  test("server 500 enters the error state with no dossier", async () => {
    serverStatus = CycloneDossierHttpStatus.InternalServerError;
    const { result, waitFor, unmount } = renderHook(() =>
      useCycloneDossier(CycloneDossierFixtureId.RemoteFailure),
    );
    await waitFor(() => result.current.error !== null);

    expect(result.current.error).not.toBeNull();
    expect(result.current.dossier).toBeNull();
    expect(result.current.loading).toBe(false);
    unmount();
  });
});
