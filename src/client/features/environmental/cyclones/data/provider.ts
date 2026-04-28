import { BaseProvider } from "@/features/base/BaseProvider";
import { CACHE_KEYS } from "@/lib/cacheKeys";
import { authenticatedFetch } from "@/lib/authService";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CycloneData, GeoJSONPolygon } from "../types";
import { fetchCurrentStorms } from "./parseNhc";

/**
 * Fetch active storms, then fan out per-storm cone fetches in parallel
 * via /api/cyclones/:stormId/cone. Each successful cone response gets
 * attached to the storm's `data.officialCone`. Failures are silent —
 * the worker falls back to the synthesized error-radius cone whenever
 * `officialCone` is absent, so a cone fetch outage never blocks the
 * primary storm render.
 *
 * In-place mutation on the parsed CycloneData record (rather than
 * `{ ...storm, officialCone }`) preserves the array-reference contract
 * with the render-batching pattern (see Commit 0cb3142): when the same
 * storm survives across polls, its DataPoint identity is stable and
 * downstream memos that gate on reference equality skip recomputation.
 */
async function fetchCurrentStormsWithCone(): Promise<DataPoint[]> {
  const storms = await fetchCurrentStorms();

  const conesResult = await Promise.allSettled(
    storms.map((s) => fetchOfficialCone(s)),
  );

  for (let i = 0; i < storms.length; i++) {
    const r = conesResult[i];
    if (r?.status === "fulfilled" && r.value) {
      const data = storms[i]!.data as CycloneData;
      data.officialCone = r.value;
    }
  }

  return storms;
}

async function fetchOfficialCone(
  storm: DataPoint,
): Promise<GeoJSONPolygon | null> {
  const stormId = (storm.data as CycloneData).stormId;
  if (!stormId) return null;
  try {
    const res = await authenticatedFetch(
      `/api/cyclones/${encodeURIComponent(stormId)}/cone`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { cone?: GeoJSONPolygon | null };
    return json.cone ?? null;
  } catch {
    return null;
  }
}

/**
 * Singleton cyclone provider.
 *
 * - 25-minute staleness, tighter than the 30-minute poll, satisfies the
 *   constraints.md cache invariant (maxCacheAgeMs ≤ pollInterval).
 * - allowEmptyResult: true — out of hurricane season, NHC legitimately
 *   returns activeStorms: []. That IS the truth, not a soft error. The
 *   server-side cyclonesCache.ts applies the same semantic.
 */
export const cycloneProvider = new BaseProvider({
  id: "nhc-cyclones",
  cacheKey: CACHE_KEYS.cyclones,
  maxCacheAgeMs: 25 * 60_000,
  fetchFn: fetchCurrentStormsWithCone,
  allowEmptyResult: true,
});
