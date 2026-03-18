// ── Source status type (moved from StatusBadge.tsx) ──────────────────

export type SourceStatus = {
  id: string;
  label: string;
  status:
    | "loading"
    | "live"
    | "cached"
    | "mock"
    | "error"
    | "empty"
    | "unavailable";
};

/**
 * Determine if a data source is considered "down" for UI purposes.
 * A source is down if its status is error/unavailable AND it has zero records.
 * Weather is exempt from "empty" — 0 active alerts is a valid state.
 */
export function isSourceDown(
  status: string | undefined,
  count: number,
  sourceId?: string,
): boolean {
  if (!status) return false;
  // Weather can legitimately have 0 alerts — "empty" is not an error
  if (sourceId === "weather" && status === "empty") return false;
  const downStatuses = ["error", "unavailable", "empty"];
  return downStatuses.includes(status) && count === 0;
}

/**
 * Build a source status lookup map from the dataSources array.
 */
export function buildSourceStatusMap(
  dataSources: SourceStatus[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of dataSources) map.set(s.id, s.status);
  return map;
}
