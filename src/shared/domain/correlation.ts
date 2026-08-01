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
