import type { DataPoint } from "@/features/base/dataPoints";

// ── In-place diff for stable-reference snapshots ─────────────────────
//
// Compare two DataPoint arrays by id-set. When membership is unchanged,
// mutate the prior array's items field-by-field from incoming and return
// the prior array reference. When membership changed (or there is no
// prior), return the incoming array reference.
//
// This preserves array identity across same-id-set polls so React-side
// consumers gating on reference equality (idMap, availableCountries) skip
// recomputation, and the Globe render path's heavy postMessage isn't
// re-triggered every 15 s. Membership-change polls (rare) allocate a
// fresh array as today. See render-batching tests for the contract.

export type DiffResult<T extends DataPoint> = {
  entities: T[];
  identityChanged: boolean;
};

export function diffAndApply<T extends DataPoint>(
  prior: T[] | null,
  incoming: T[],
): DiffResult<T> {
  if (!prior || prior.length === 0) {
    return { entities: incoming, identityChanged: true };
  }
  if (prior.length !== incoming.length) {
    return { entities: incoming, identityChanged: true };
  }

  const ids = new Set<string>();
  for (let i = 0; i < prior.length; i++) ids.add(prior[i]!.id);
  for (let i = 0; i < incoming.length; i++) {
    if (!ids.has(incoming[i]!.id)) {
      return { entities: incoming, identityChanged: true };
    }
  }

  // Same id-set. Build id→prior map for O(1) lookup, then copy mutable
  // fields from each incoming record onto its prior counterpart. The
  // prior array's own ordering is preserved (callers may rely on it).
  const priorById = new Map<string, T>();
  for (let i = 0; i < prior.length; i++) priorById.set(prior[i]!.id, prior[i]!);
  for (let i = 0; i < incoming.length; i++) {
    const inc = incoming[i]!;
    const tgt = priorById.get(inc.id);
    if (tgt) Object.assign(tgt, inc);
  }
  return { entities: prior, identityChanged: false };
}
