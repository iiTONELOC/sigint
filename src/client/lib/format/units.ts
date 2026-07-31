// Knots → mph / km/h. NHC/cyclone winds, aircraft ground speed, and AIS ship
// speed all arrive in knots; how they're shown follows the user's Units pref
// (Settings → Appearance), defaulting to "both". Single source for the
// conversions that used to be inlined across the cyclone/aircraft/ship displays.
import { getUnitsMode } from "@/lib/ui/userPreferences";

export const KT_TO_MPH = 1.15078;
export const KT_TO_KMH = 1.852;
export const KT_TO_MPS = 0.5144;
export const NM_TO_KM = 1.852;
export const KM_TO_MI = 0.621371;
export const KELVIN_OFFSET = 273.15;

/** Kelvin → Celsius. */
export function kelvinToC(k: number): number {
  return k - KELVIN_OFFSET;
}

/** Celsius → Fahrenheit. */
export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

export const KM_TO_M = 1000;
export const M_TO_FT = 3.28084;

/** Sub-km footprint (two dims, in km), unit-pref aware like formatKmMi: both
 *  metres + feet by default, or one under an explicit pref —
 *  `330 × 550 m (1083 × 1804 ft)` / `330 × 550 m` / `1083 × 1804 ft`. */
export function formatPixelKm(scanKm: number, trackKm: number): string {
  const sm = Math.round(scanKm * KM_TO_M);
  const tm = Math.round(trackKm * KM_TO_M);
  const sf = Math.round(scanKm * KM_TO_M * M_TO_FT);
  const tf = Math.round(trackKm * KM_TO_M * M_TO_FT);
  switch (getUnitsMode()) {
    case "mph":
      return `${sf} × ${tf} ft`;
    case "kt":
    case "kmh":
      return `${sm} × ${tm} m`;
    default:
      return `${sm} × ${tm} m (${sf} × ${tf} ft)`;
  }
}

/** Brightness/air temp in Kelvin, unit-pref aware: `33 °C (91 °F)` / `33 °C` /
 *  `91 °F`. Mirrors formatKmMi — imperial under the mph pref, metric otherwise. */
export function formatTempCF(kelvin: number): string {
  const c = kelvinToC(kelvin);
  const f = cToF(c);
  switch (getUnitsMode()) {
    case "mph":
      return `${Math.round(f)} °F`;
    case "kt":
    case "kmh":
      return `${Math.round(c)} °C`;
    default:
      return `${Math.round(c)} °C (${Math.round(f)} °F)`;
  }
}

/** Kilometres → whole miles. */
export function kmToMi(km: number): number {
  return Math.round(km * KM_TO_MI);
}

/** Distance, unit-pref aware: `10 km (6 mi)` / `10 km` / `6 mi`. */
export function formatKmMi(km: number): string {
  const rounded = Math.round(km);
  switch (getUnitsMode()) {
    case "mph":
      return `${kmToMi(km)} mi`;
    case "kt":
    case "kmh":
      return `${rounded} km`;
    default:
      return `${rounded} km (${kmToMi(km)} mi)`;
  }
}

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

/** Min central pressure, as the dossier and the detail rows show it. */
export function formatPressureMb(mb: number): string {
  return `${mb} mb`;
}

/** A compass bearing in degrees: `290°`. */
export function formatBearingDeg(deg: number): string {
  return `${deg}°`;
}

/** Track error and other nautical distances: `41 nm (76 km)`. */
export function formatNmKm(nm: number): string {
  return `${nm} nm (${nmToKm(nm)} km)`;
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
