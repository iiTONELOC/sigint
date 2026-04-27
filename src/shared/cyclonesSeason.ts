// ── Hemisphere-aware cyclone season helper ────────────────────────
// Single source of truth for "is this basin currently in active
// cyclone season". Consumed by:
//   - src/server/api/cyclonesCache.ts — gates the NHC fetch when
//     all in-scope basins are out of season AND the cache is empty.
//   - src/client/components/Header.tsx — gates the cyclones layer
//     toggle visibility (hidden when all in-scope basins are out
//     of season AND no storms exist).
//
// Basin scope: the helper covers all six WMO basins (AL, EP, CP for
// the National Hurricane Center; WP, IO, SH for the Joint Typhoon
// Warning Center). Only NHC is wired up at runtime today — JTWC
// CloudFront blocks both Heroku and the dev box, deferred to a
// relay-based v2 ticket. The helper ships hemisphere-aware so v2
// integration is a one-line `ACTIVE_BASINS` change.
//
// Season windows (UTC):
//   AL / EP / CP  — May 15 – Dec 15  (Northern Hemisphere)
//   SH            — Oct 15 – May 15  (Southern Hemisphere, year-wrap)
//   WP / IO       — year-round
//
// Boundary semantics: the start and end days are *inclusive*. May 15
// counts as in-season for Northern Hemi, Oct 15 for Southern.

export type CycloneBasin = "AL" | "EP" | "CP" | "WP" | "IO" | "SH";

/** The basins the runtime currently fetches from. NHC's
 *  CurrentStorms.json covers AL/EP/CP in one response; WP/IO/SH stay
 *  out until the JTWC relay lands. */
export const ACTIVE_BASINS: readonly CycloneBasin[] = ["AL", "EP", "CP"];

/** Northern Hemisphere window: May 15 – Dec 15 inclusive. */
function inNorthernHemiWindow(month: number, day: number): boolean {
  if (month > 5 && month < 12) return true;
  if (month === 5 && day >= 15) return true;
  if (month === 12 && day <= 15) return true;
  return false;
}

/** Southern Hemisphere window: Oct 15 – May 15 inclusive (year wrap). */
function inSouthernHemiWindow(month: number, day: number): boolean {
  if (month >= 11 || month <= 4) return true;
  if (month === 10 && day >= 15) return true;
  if (month === 5 && day <= 15) return true;
  return false;
}

export function basinSeasonActive(
  basin: CycloneBasin,
  now: Date = new Date(),
): boolean {
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();

  // WP (W. Pacific) + IO (N. Indian Ocean): year-round.
  if (basin === "WP" || basin === "IO") return true;

  if (basin === "AL" || basin === "EP" || basin === "CP") {
    return inNorthernHemiWindow(month, day);
  }

  if (basin === "SH") {
    return inSouthernHemiWindow(month, day);
  }

  return true;
}

/** True if any basin in the global set is currently in season. With
 *  WP/IO year-round, this is always true in production — kept as a
 *  forward-compat hook for hypothetical scope changes. */
export function anyBasinActive(now: Date = new Date()): boolean {
  return (["AL", "EP", "CP", "WP", "IO", "SH"] as const).some((b) =>
    basinSeasonActive(b, now),
  );
}

/** True if any of the actively-fetched basins is in season. Used by
 *  cache.fetchCyclones() to decide whether the empty-cache skip rule
 *  applies. With ACTIVE_BASINS = AL/EP/CP, this is the N-Hemi window. */
export function anyActiveBasinInSeason(now: Date = new Date()): boolean {
  return ACTIVE_BASINS.some((b) => basinSeasonActive(b, now));
}

/** Decide whether the cyclones layer toggle should render. Hidden
 *  ONLY when both (a) all in-scope basins are out of season AND (b)
 *  no storms exist. In-season → visible (a storm could appear any
 *  moment); any non-zero count → visible regardless of season (a
 *  rare late-season storm or post-season trailer must not vanish
 *  from the UI). Filter state lives in upstream context, so a
 *  render-only filter preserves user intent across visibility flips. */
export function shouldShowCyclonesToggle(
  stormCount: number,
  now: Date = new Date(),
): boolean {
  if (stormCount > 0) return true;
  return anyActiveBasinInSeason(now);
}
