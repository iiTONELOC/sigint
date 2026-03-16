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

  // Location context from GDELT
  locationName?: string;
  locationResolution?: number; // 1=country, 2=ADM1, 3=city/landmark
};

export type EventFilter = {
  enabled: boolean;
  minSeverity: number;
};
