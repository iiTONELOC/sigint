import type { SourceStatus } from "@shared/domain/sourceStatus";

export type SourceStatusEntry = Readonly<{
  id: string;
  status: SourceStatus;
  error: string | null;
}>;

export function buildSourceStatusMap(
  entries: readonly SourceStatusEntry[],
): ReadonlyMap<string, SourceStatusEntry> {
  const byId = new Map<string, SourceStatusEntry>();
  for (const entry of entries) byId.set(entry.id, entry);
  return byId;
}
