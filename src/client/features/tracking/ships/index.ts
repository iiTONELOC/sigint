// Public API — everything outside this folder imports from here
export { shipsFeature } from "./definition";
export { useShipData } from "./hooks/useShipData";
export type { ShipDataSource } from "./hooks/useShipData";
export { shipProvider } from "./data/provider";

// Re-export types
export type { ShipData } from "./types";
