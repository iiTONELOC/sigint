// Knots → mph. NHC/cyclone winds, aircraft ground speed, and AIS ship speed
// all arrive in knots, but most readers think in mph — so we show both. Single
// source for the conversion that used to be inlined (× 1.15078) across the
// aircraft, ship, and cyclone displays.
export const KT_TO_MPH = 1.15078;

/** Knots → whole mph. */
export function ktToMph(kt: number): number {
  return Math.round(kt * KT_TO_MPH);
}

/** Detail-row style, e.g. `85 kn (98 mph)`. */
export function formatKtMph(kt: number): string {
  return `${kt} kn (${ktToMph(kt)} mph)`;
}
