// Public API — everything outside this folder imports from here
export { firesFeature } from "./definition";
export { useFireData } from "./hooks/useFireData";
export type { FireDataSource } from "./hooks/useFireData";
export { FireProvider } from "./data/provider";

// Re-export types
export type { FireData, FireFilter } from "./types";
