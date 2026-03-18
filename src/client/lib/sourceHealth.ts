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
 * A source is down only if its status is error or unavailable.
 * "empty" is NOT a down state — the server retains stale cache on 0 upstream
 * records, so "empty" should only occur on genuine cold starts.
 */
export function isSourceDown(
  status: string | undefined,
  count: number,
  sourceId?: string,
): boolean {
  if (!status) return false;
  return (status === "error" || status === "unavailable") && count === 0;
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
