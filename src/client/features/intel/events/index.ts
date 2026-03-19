// Public API — everything outside this folder imports from here
export { eventsFeature } from "./definition";
export { useEventData } from "./hooks/useEventData";
export type { EventDataSource } from "./hooks/useEventData";
export { gdeltProvider } from "./data/provider";

// Re-export types
export type { EventData, EventFilter } from "./types";
