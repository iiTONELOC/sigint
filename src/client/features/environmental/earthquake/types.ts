export type EarthquakeData = {
  magnitude?: number;
  depth?: number;
  location?: string;
  felt?: number;
  tsunami?: boolean;
  alert?: string;
  significance?: number;
  magType?: string;
  eventType?: string;
  url?: string;
  status?: string;
};

export type EarthquakeFilter = {
  enabled: boolean;
  minMagnitude: number;
};
