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
