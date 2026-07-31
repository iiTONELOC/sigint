// Public API — everything outside this folder imports from here
export { firesFeature } from "./definition";
export {
  useFireSourceSnapshot,
  useFireUiQuery,
} from "./hooks/useFireSource";

// Re-export types
export type { FireData, FireFilter } from "./types";
