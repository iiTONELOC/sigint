// ── Derived data pass (off the render path) ──────────────────────────
// idMap, spatialGrid, filteredIds, counts, availableCountries and
// tickerItems are one O(n) walk of allData. Run synchronously in a render
// useMemo, this ~22k-item loop was the main-thread stall that froze the DOM
// on every poll. It is split here into a chunked, cancelable async pass that
// yields to the main thread between chunks — callers serve the prior result
// until a fresh one is ready (stale-while-recompute). Pure: no React, no I/O.

import type { DataPoint } from "@/features/base/dataPoints";
import { featureRegistry } from "@/features/registry";
import { cellKey, type SpatialGrid } from "@/lib/spatialIndex";
import { yieldToMain } from "@/lib/yield";

// Ticker is intentionally NOT here: it gates on membership only ([allData]),
// so a filter/layer toggle must not reshuffle the feed. It stays a separate
// memo in DataContext. See tests/components/touchTargets.spec.ts.
export type Derived = {
  idMap: Map<string, DataPoint>;
  spatialGrid: SpatialGrid;
  filteredIds: Set<string>;
  counts: Record<string, number>;
  availableCountries: string[];
};

type Acc = {
  idMap: Map<string, DataPoint>;
  cells: Map<number, DataPoint[]>;
  filteredIds: Set<string>;
  counts: Record<string, number>;
  countryTally: Map<string, number>;
};

function newAcc(): Acc {
  const counts: Record<string, number> = {};
  for (const [id] of featureRegistry) counts[id] = 0;
  return {
    idMap: new Map(),
    cells: new Map(),
    filteredIds: new Set(),
    counts,
    countryTally: new Map(),
  };
}

// Process allData[start, end) into the accumulator. Index range so a chunk
// can be walked without allocating a slice.
function processSlice(
  allData: DataPoint[],
  filters: Record<string, unknown>,
  acc: Acc,
  start: number,
  end: number,
): void {
  for (let i = start; i < end; i++) {
    const item = allData[i]!;
    acc.idMap.set(item.id, item);

    const key = cellKey(item.lat, item.lon);
    const cell = acc.cells.get(key);
    if (cell) cell.push(item);
    else acc.cells.set(key, [item]);

    const feature = featureRegistry.get(item.type);
    if (feature) {
      const filter = filters[item.type];
      if (filter != null && feature.matchesFilter(item as never, filter)) {
        acc.filteredIds.add(item.id);
        acc.counts[item.type] = (acc.counts[item.type] ?? 0) + 1;
      }
    }

    if (item.type === "aircraft") {
      const country = (item.data as { originCountry?: string })?.originCountry;
      if (country)
        acc.countryTally.set(country, (acc.countryTally.get(country) ?? 0) + 1);
    }
  }
}

function finalize(allData: DataPoint[], acc: Acc): Derived {
  // Forecast points inherit their parent storm's filter status (needs the
  // main walk complete so the parent id is settled in the set).
  for (const item of allData) {
    if (item.type !== "cyclones-forecast") continue;
    const parentId = `CY${(item.data as { parentStormId: string }).parentStormId}`;
    if (acc.filteredIds.has(parentId)) acc.filteredIds.add(item.id);
  }

  const availableCountries = Array.from(acc.countryTally.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([country]) => country);

  return {
    idMap: acc.idMap,
    spatialGrid: { cells: acc.cells, size: allData.length },
    filteredIds: acc.filteredIds,
    counts: acc.counts,
    availableCountries,
  };
}

/** Synchronous one-shot — used only for the initial mount value. */
export function buildDerivedSync(
  allData: DataPoint[],
  filters: Record<string, unknown>,
): Derived {
  const acc = newAcc();
  processSlice(allData, filters, acc, 0, allData.length);
  return finalize(allData, acc);
}

const CHUNK = 4096;

/** Chunked async pass — yields to the main thread between chunks and bails
 *  early if a newer computation has superseded this one. */
export async function buildDerivedChunked(
  allData: DataPoint[],
  filters: Record<string, unknown>,
  isCancelled: () => boolean,
): Promise<Derived | null> {
  const acc = newAcc();
  for (let start = 0; start < allData.length; start += CHUNK) {
    processSlice(allData, filters, acc, start, Math.min(start + CHUNK, allData.length));
    if (start + CHUNK < allData.length) {
      await yieldToMain();
      if (isCancelled()) return null;
    }
  }
  return finalize(allData, acc);
}
