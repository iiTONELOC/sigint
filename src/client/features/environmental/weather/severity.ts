// Single owner for NWS alert severity → numeric rank. Pure (no imports) so both
// the weather feature definition and the globe render worker consume it without
// pulling in React/icon code.

export const WEATHER_SEVERITY_RANK: Record<string, number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 0,
};

/** Rank for an NWS severity string; 0 for unknown/missing. */
export function weatherSeverityRank(severity: string | undefined): number {
  return WEATHER_SEVERITY_RANK[severity ?? "Unknown"] ?? 0;
}

export type SeverityMeta = {
  rank: number;
  label: string;
  /** Text/accent tone, legible on both light and dark panels. */
  ink: string;
};

// Violet→magenta ramp — the weather layer's own identity (purple family),
// deliberately distinct from the fire heat ramp (orange/amber) and cyclone red.
const SEVERITY_META: Record<string, SeverityMeta> = {
  Extreme: { rank: 4, label: "EXTREME", ink: "#e64980" },
  Severe: { rank: 3, label: "SEVERE", ink: "#cc5de8" },
  Moderate: { rank: 2, label: "MODERATE", ink: "#9775fa" },
  Minor: { rank: 1, label: "MINOR", ink: "#5c7cfa" },
  Unknown: { rank: 0, label: "UNKNOWN", ink: "#6b7a8d" },
};

export function severityMeta(severity: string | undefined): SeverityMeta {
  return SEVERITY_META[severity ?? "Unknown"] ?? SEVERITY_META.Unknown!;
}
