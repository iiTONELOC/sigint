// Public API — everything outside this folder imports from here
export { aircraftFeature } from "./definition";
export { useAircraftData } from "./hooks/useAircraftData";
export type { AircraftDataSource } from "./hooks/useAircraftData";
export { matchesAircraftFilter } from "./lib/utils";
export {
  getInitialAircraftFilter,
  syncAircraftFilterToUrl,
  DEFAULT_AIRCRAFT_FILTER,
} from "./lib/filterUrl";
export { AircraftFilterControl } from "./ui/AircraftFilterControl";

// Re-export types
export type { AircraftData, AircraftFilter, SquawkStatus } from "./types";
