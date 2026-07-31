export enum EventSeverity {
  Monitoring = 1,
  Concern = 2,
  Tension = 3,
  Conflict = 4,
  Crisis = 5,
}

export function eventSeverity(value: number | undefined): EventSeverity {
  if (value === EventSeverity.Concern) return EventSeverity.Concern;
  if (value === EventSeverity.Tension) return EventSeverity.Tension;
  if (value === EventSeverity.Conflict) return EventSeverity.Conflict;
  if (value === EventSeverity.Crisis) return EventSeverity.Crisis;
  return EventSeverity.Monitoring;
}

export type EventData = {
  // Content
  headline?: string;
  snippet?: string;
  category?: string;
  source?: string;
  sourceDomain?: string;
  sourceCountry?: string;
  language?: string;
  url?: string;
  imageUrl?: string;

  // Analysis
  tone?: number;
  severity?: number;
  goldstein?: number; // -10 (conflict) … +10 (cooperation)
  mentions?: number; // media volume across sources
  actor1?: string;
  actor2?: string;
  eventCode?: string; // CAMEO event code

  // Location context from GDELT
  locationName?: string;
  locationResolution?: number; // 1=country, 2=ADM1, 3=city/landmark
};

export type EventFilter = {
  enabled: boolean;
  minSeverity: number;
};
