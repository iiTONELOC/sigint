// Single source for vessel operational state + motion intel, mirroring the
// other features' meta modules. Nav-status drives the dossier accent so an
// aground / not-under-command vessel reads as an alert.

export type NavMeta = {
  label: string;
  /** Accent/text tone, legible on both themes. */
  ink: string;
  /** True for states that warrant attention. */
  alert: boolean;
};

const NAV_META: Record<number, NavMeta> = {
  0: { label: "UNDER WAY", ink: "#2bb3a3", alert: false }, // engine
  8: { label: "UNDER SAIL", ink: "#2bb3a3", alert: false },
  1: { label: "AT ANCHOR", ink: "#4a7fd6", alert: false },
  5: { label: "MOORED", ink: "#4a7fd6", alert: false },
  7: { label: "FISHING", ink: "#d99a2b", alert: false },
  3: { label: "RESTRICTED", ink: "#e0772b", alert: true },
  4: { label: "CONSTRAINED", ink: "#e0772b", alert: true }, // by draught
  11: { label: "TOWING ASTERN", ink: "#d99a2b", alert: false },
  12: { label: "PUSHING/TOWING", ink: "#d99a2b", alert: false },
  2: { label: "NOT UNDER CMD", ink: "#d4493f", alert: true },
  6: { label: "AGROUND", ink: "#d4493f", alert: true },
  14: { label: "AIS-SART", ink: "#d4493f", alert: true },
};

const NAV_UNKNOWN: NavMeta = { label: "UNKNOWN", ink: "#6b7a8d", alert: false };

export function navStatusMeta(status?: number): NavMeta {
  if (status == null) return NAV_UNKNOWN;
  return NAV_META[status] ?? NAV_UNKNOWN;
}

/** Signed bow-vs-track angle in degrees [-180,180]: how far the vessel is
 *  crabbing off its heading (set & drift from current/wind). Null if either
 *  input is missing/invalid (heading 511 = unavailable). */
export function setDrift(heading?: number, cog?: number): number | null {
  if (heading == null || cog == null || heading === 511) return null;
  let d = cog - heading;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Rate-of-turn intel from the raw AIS value. -128 = unavailable, 0 = steady,
 *  sign = direction (negative port / positive starboard), ±127 = hard turn. */
export function rotLabel(rot?: number): string | null {
  if (rot == null || rot === -128 || rot === 128) return null;
  if (rot === 0) return "steady";
  const dir = rot < 0 ? "port" : "starboard";
  return Math.abs(rot) >= 127 ? `hard to ${dir}` : `turning to ${dir}`;
}

/** Behavioural anomalies — cross-checking the (crew-set) nav status against the
 *  (instrument-fed) motion. Mismatches flag AIS errors / spoofing / mislabels;
 *  alert states flag operational distress. Empty when nothing's off. */
export function shipAnomalies(navStatus?: number, sog?: number): string[] {
  const out: string[] = [];
  const s = sog ?? 0;
  if (navStatus === 5 && s > 1) out.push(`Moored but making ${s.toFixed(1)} kn`);
  if (navStatus === 1 && s > 1) out.push(`At anchor but making ${s.toFixed(1)} kn`);
  if (navStatus === 7 && s > 8) out.push(`Fishing at ${s.toFixed(1)} kn — unusually fast`);
  if (navStatus === 2) out.push("Not under command");
  if (navStatus === 6) out.push("Aground");
  if (navStatus === 3) out.push("Restricted manoeuvrability");
  if (navStatus === 4) out.push("Constrained by draught");
  return out;
}
