import type { Band } from "../types/bands";
export enum IntelProductType {
  Cluster = "cluster",
  CrossSource = "cross-source",
  Anomaly = "anomaly",
  Trend = "trend",
  NewsLink = "news-link",
}

export enum IntelSeverity {
  Monitoring = 1,
  Concern = 2,
  Tension = 3,
  Conflict = 4,
  Crisis = 5,
}

export function parseIntelSeverity(value: number | undefined): IntelSeverity {
  if (value === IntelSeverity.Concern) return IntelSeverity.Concern;
  if (value === IntelSeverity.Tension) return IntelSeverity.Tension;
  if (value === IntelSeverity.Conflict) return IntelSeverity.Conflict;
  if (value === IntelSeverity.Crisis) return IntelSeverity.Crisis;
  return IntelSeverity.Monitoring;
}

export type IntelSeverityMinimums = Readonly<{
  crisis: number;
  conflict: number;
  tension: number;
  concern: number;
}>;

export function intelSeverityBands(
  minimums: IntelSeverityMinimums,
): readonly Band<IntelSeverity>[] {
  return [
    { floor: minimums.crisis, value: IntelSeverity.Crisis },
    { floor: minimums.conflict, value: IntelSeverity.Conflict },
    { floor: minimums.tension, value: IntelSeverity.Tension },
    { floor: minimums.concern, value: IntelSeverity.Concern },
  ];
}
