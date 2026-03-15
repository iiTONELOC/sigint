// Public API — everything outside this folder imports from here
export { aircraftFeature } from "./definition";
export { useAircraftData } from "./useAircraftData";
export type { AircraftDataSource } from "./useAircraftData";
export { matchesAircraftFilter } from "./utils";
export {
  getInitialAircraftFilter,
  syncAircraftFilterToUrl,
  DEFAULT_AIRCRAFT_FILTER,
} from "./filterUrl";
export { AircraftFilterControl } from "./AircraftFilterControl";

// Re-export types
export type { AircraftData, AircraftFilter, SquawkStatus } from "./types";
