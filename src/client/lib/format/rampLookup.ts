// Shared mechanism for "walk a list of bands, return the first that matches".
// The bands (the policy) stay with each caller; only the lookup loop lives here.
// Replaces the hand-rolled if-chains in fire-confidence and event-tone ramps.

/** A band whose payload applies when `value <= max`. Order bands ascending by
 *  `max`; the first satisfied band wins (so list the lowest threshold first). */
export type Band<T> = { max: number; value: T };

/**
 * First band whose `max` is ≥ `value`, else `fallback`. Bands are scanned in
 * order, so callers list them from lowest threshold to highest.
 */
export function rampBand<T>(value: number, bands: ReadonlyArray<Band<T>>, fallback: T): T {
  for (const band of bands) {
    if (value <= band.max) return band.value;
  }
  return fallback;
}
