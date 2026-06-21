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

// ── Mach / speed-of-sound (ISA) ──────────────────────────────────────
// Used to derive Mach from groundspeed when the feed doesn't carry a real
// `mach` field. Standard-atmosphere speed of sound falls with altitude to the
// tropopause (~36089 ft), then is ~constant in the isothermal stratosphere.
const A0_KT = 661.4788; // speed of sound at sea level, ISA, in knots
const TROPOPAUSE_FT = 36089;
const A_TROPO_KT = 573.8; // speed of sound above the tropopause (ISA)

/** ISA speed of sound (kt) at a pressure altitude in feet. */
export function isaSpeedOfSoundKt(altFt: number): number {
  if (altFt >= TROPOPAUSE_FT) return A_TROPO_KT;
  return A0_KT * Math.sqrt(1 - 6.8755856e-6 * Math.max(0, altFt));
}

/** Approximate Mach from groundspeed (kt) + altitude (ft) via ISA — only a
 *  fallback for when the feed omits a real `mach`. Ignores wind. */
export function machFromGs(gs: number, altFt: number): number {
  return gs / isaSpeedOfSoundKt(altFt);
}

/** ISA standard temperature (°C) at a pressure altitude in feet. */
export function isaTempC(altFt: number): number {
  if (altFt >= TROPOPAUSE_FT) return -56.5;
  return 15 - 1.98 * (altFt / 1000);
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
