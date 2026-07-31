// Single source of truth for fire intensity + detection physics, mirroring the
// earthquake intensity module. Bands are fire radiative power (FRP, MW); the
// detection threshold and confidence meanings come from the official VIIRS
// 375 m active-fire docs (NASA FIRMS / VNP14): low = sun-glint or weak (<15 K
// I4 anomaly), nominal = clean & strong (>15 K, day or night), high = saturated
// pixel. Hence ΔT = bright_ti4 − bright_ti5 is the signal the algorithm keys on.

export type FrpBand = {
  /** Inclusive lower bound in MW. */
  min: number;
  label: string;
  /** Ramp fill (heat scale: ember → white-hot). */
  color: string;
  /** Text/accent tone, legible on both themes. */
  ink: string;
};

// Ordered high → low so frpBand can pick the first matching floor.
export const FRP_SCALE: readonly FrpBand[] = [
  { min: 500, label: "EXTREME", color: "#fde047", ink: "#d97706" },
  { min: 100, label: "VERY HIGH", color: "#fb923c", ink: "#ea580c" },
  { min: 50, label: "HIGH", color: "#f97316", ink: "#e25406" },
  { min: 10, label: "MODERATE", color: "#ea580c", ink: "#c2410c" },
  { min: 0, label: "LOW", color: "#9a3412", ink: "#9a3412" },
];

const FRP_FLOOR: FrpBand = FRP_SCALE.at(-1) ?? { min: 0, label: "LOW", color: "#9a3412", ink: "#9a3412" };

/** The I4−I5 brightness-temperature anomaly (K) above which a daytime pixel is
 *  flagged nominal rather than low confidence — the core VIIRS detection rule. */
export const DELTA_T_DETECT_K = 15;

export function frpBand(frp: number): FrpBand {
  return FRP_SCALE.find((b) => frp >= b.min) ?? FRP_FLOOR;
}

export function frpColor(frp: number): string {
  return frpBand(frp).color;
}

export function frpInk(frp: number): string {
  return frpBand(frp).ink;
}

export type ConfidenceMeta = {
  /** Normalized 0–2 rank (low/nominal/high). */
  level: number;
  label: string;
  /** Plain-language meaning from the VIIRS docs. */
  meaning: string;
};

const CONFIDENCE_UNKNOWN: ConfidenceMeta = {
  level: 0,
  label: "—",
  meaning: "unrated",
};

/** Normalize a VIIRS confidence string (low/nominal/high or l/n/h) to its rank
 *  and official meaning. MODIS numeric confidence (0–100) collapses into the
 *  same three buckets. */
export function confidenceMeta(conf?: string): ConfidenceMeta {
  if (!conf) return CONFIDENCE_UNKNOWN;
  const c = conf.trim().toLowerCase();
  const numeric = Number.parseInt(c, 10);
  if (Number.isFinite(numeric) && /^\d+$/.test(c)) {
    if (numeric >= 80) return { level: 2, label: "HIGH", meaning: "saturated pixel" };
    if (numeric >= 30) return { level: 1, label: "NOMINAL", meaning: "clean, strong signal" };
    return { level: 0, label: "LOW", meaning: "weak or sun-glint" };
  }
  if (c === "high" || c === "h") return { level: 2, label: "HIGH", meaning: "saturated pixel" };
  if (c === "nominal" || c === "n") return { level: 1, label: "NOMINAL", meaning: "clean, strong signal" };
  if (c === "low" || c === "l") return { level: 0, label: "LOW", meaning: "weak or sun-glint" };
  return CONFIDENCE_UNKNOWN;
}
