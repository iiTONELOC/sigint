// Knots → mph / km/h. NHC/cyclone winds, aircraft ground speed, and AIS ship
// speed all arrive in knots; how they're shown follows the user's Units pref
// (Settings → Appearance), defaulting to "both". Single source for the
// conversions that used to be inlined across the cyclone/aircraft/ship displays.
import { getUnitsMode } from "@/lib/userPreferences";

export const KT_TO_MPH = 1.15078;
export const KT_TO_KMH = 1.852;
export const KT_TO_MPS = 0.5144;
export const NM_TO_KM = 1.852;

/** Knots → whole mph. */
export function ktToMph(kt: number): number {
  return Math.round(kt * KT_TO_MPH);
}

/** Knots → whole km/h. */
export function ktToKmh(kt: number): number {
  return Math.round(kt * KT_TO_KMH);
}

/** Knots → metres/second (unrounded — used for motion/interpolation math). */
export function ktToMps(kt: number): number {
  return kt * KT_TO_MPS;
}

/** Nautical miles → whole km (display). */
export function nmToKm(nm: number): number {
  return Math.round(nm * NM_TO_KM);
}

/** Detail-row style, unit-pref aware: `85 kn (98 mph)` / `85 kn` / `98 mph` /
 *  `157 km/h`. */
export function formatKtMph(kt: number): string {
  switch (getUnitsMode()) {
    case "kt":
      return `${kt} kn`;
    case "mph":
      return `${ktToMph(kt)} mph`;
    case "kmh":
      return `${ktToKmh(kt)} km/h`;
    default:
      return `${kt} kn (${ktToMph(kt)} mph)`;
  }
}

/** Compact style for tickers / inline labels: `85kn/98mph` / `85kn` / `98mph`
 *  / `157km/h`. */
export function formatKtShort(kt: number): string {
  switch (getUnitsMode()) {
    case "kt":
      return `${kt}kn`;
    case "mph":
      return `${ktToMph(kt)}mph`;
    case "kmh":
      return `${ktToKmh(kt)}km/h`;
    default:
      return `${kt}kn/${ktToMph(kt)}mph`;
  }
}
