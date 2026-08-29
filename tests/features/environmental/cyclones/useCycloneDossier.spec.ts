/// <reference lib="dom" />
import {
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { CycloneDossierBundle } from "@shared/domain/cyclones";
import { EMPTY_TEXT } from "@shared/text";
import { renderHook } from "../../../support/react";

enum CycloneDossierFixtureId {
  MalformedEntity = "BOGUS-ID",
  RemoteFailureEntity = "CYAL992024",
  SuccessfulEntity = "CYAL142024",
  SuccessfulStorm = "AL142024",
}

const SAMPLE_BUNDLE: CycloneDossierBundle = {
  stormId: CycloneDossierFixtureId.SuccessfulStorm,
  advisory: {
    advisoryNumber: "13",
    issuedAt: "400 AM CDT Tue Oct 08 2024",
    body: "...EXTREMELY POWERFUL HURRICANE MILTON...",
    nextAdvisory: EMPTY_TEXT,
  },
  discussion: {
    advisoryNumber: "13",
    issuedAt: "400 AM CDT Tue Oct 08 2024",
    body: "Air Force Hurricane Hunters and NOAA aircraft...",
    nextAdvisory: EMPTY_TEXT,
  },
};

const WORKER_FAILURE = "Simulated DataWorker failure";
let requestCount = 0;
let lastEntityId = EMPTY_TEXT;
let workerResult: CycloneDossierBundle | null = SAMPLE_BUNDLE;
let workerRejects = false;

mock.module("@/lib/cache/dataWorkerClient", () => ({
  getDataWorkerClient: () => ({
    getCycloneDossier: async (
      entityId: string,
    ): Promise<CycloneDossierBundle | null> => {
      requestCount += 1;
      lastEntityId = entityId;
      if (workerRejects) throw new Error(WORKER_FAILURE);
      return workerResult;
    },
  }),
}));

const { useCycloneDossier } = await import(
  "@/features/environmental/cyclones/hooks/useCycloneDossier"
);

describe("useCycloneDossier", () => {
  beforeEach(() => {
    requestCount = 0;
    lastEntityId = EMPTY_TEXT;
    workerResult = SAMPLE_BUNDLE;
    workerRejects = false;
  });

  test("requests the dossier from DataWorker on mount", async () => {
    const { result, waitFor, unmount } = renderHook(() =>
      useCycloneDossier(CycloneDossierFixtureId.SuccessfulEntity),
    );
    await waitFor(() => result.current.dossier !== null);

    expect(result.current.dossier?.stormId).toBe(
      CycloneDossierFixtureId.SuccessfulStorm,
    );
    expect(result.current.dossier?.advisory?.advisoryNumber).toBe("13");
    expect(result.current.loading).toBe(false);
    expect(lastEntityId).toBe(CycloneDossierFixtureId.SuccessfulEntity);
    unmount();
  });

  test("returns null and skips DataWorker when entityId is null", async () => {
    const { result, unmount } = renderHook(() => useCycloneDossier(null));

    expect(result.current.dossier).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(requestCount).toBe(0);
    unmount();
  });

  test("returns null when DataWorker rejects a malformed entity", async () => {
    workerResult = null;
    const { result, waitFor, unmount } = renderHook(() =>
      useCycloneDossier(CycloneDossierFixtureId.MalformedEntity),
    );
    await waitFor(() => !result.current.loading);

    expect(result.current.dossier).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(requestCount).toBe(1);
    unmount();
  });

  test("DataWorker failure leaves no dossier after loading completes", async () => {
    workerRejects = true;
    const { result, waitFor, unmount } = renderHook(() =>
      useCycloneDossier(CycloneDossierFixtureId.RemoteFailureEntity),
    );
    await waitFor(() => !result.current.loading);

    expect(requestCount).toBe(1);
    expect(result.current.dossier).toBeNull();
    expect(result.current.loading).toBe(false);
    unmount();
  });
});
