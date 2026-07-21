// Public API — everything outside this folder imports from here
export { earthquakeFeature } from "./definition";
export {
  useEarthquakeSourceSnapshot,
  useEarthquakeUiQuery,
} from "./hooks/useEarthquakeSource";

// Re-export types
export type { EarthquakeData, EarthquakeFilter } from "./types";
