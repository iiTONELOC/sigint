// Public API — everything outside this folder imports from here
export { earthquakeFeature } from "./definition";
export { useEarthquakeData } from "./hooks/useEarthquakeData";
export type { EarthquakeDataSource } from "./hooks/useEarthquakeData";
export { earthquakeProvider } from "./data/provider";

// Re-export types
export type { EarthquakeData, EarthquakeFilter } from "./types";
