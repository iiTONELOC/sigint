import type { DataPoint } from "@/features/base/dataPoints";

export const TICKER_ITEM_LIMIT = 80;

export type TickerPage = Readonly<{
  items: readonly DataPoint[];
  priorityCount: number;
}>;

function collectPriority(pages: readonly TickerPage[]): DataPoint[] {
  const leading: DataPoint[] = [];
  for (const page of pages) {
    for (const item of page.items.slice(0, page.priorityCount)) {
      if (leading.length >= TICKER_ITEM_LIMIT) return leading;
      leading.push(item);
    }
  }
  return leading;
}

function interleaveRemainder(
  pages: readonly TickerPage[],
  result: DataPoint[],
): void {
  const cursors = pages.map((page) => page.priorityCount);
  let added = true;
  while (added && result.length < TICKER_ITEM_LIMIT) {
    added = false;
    for (const [index, page] of pages.entries()) {
      if (result.length >= TICKER_ITEM_LIMIT) return;
      const cursor = cursors[index] ?? 0;
      const item = page.items[cursor];
      if (!item) continue;
      result.push(item);
      cursors[index] = cursor + 1;
      added = true;
    }
  }
}

function randomBelow(bound: number): number {
  const draw = new Uint32Array(1);
  crypto.getRandomValues(draw);
  return (draw[0] ?? 0) % bound;
}

function shuffleInPlace(items: DataPoint[]): void {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = randomBelow(index + 1);
    const current = items[index];
    const swap = items[swapIndex];
    if (!current || !swap) continue;
    items[index] = swap;
    items[swapIndex] = current;
  }
}

export function mergeTickerPages(pages: readonly TickerPage[]): DataPoint[] {
  const leading = collectPriority(pages);
  const result = [...leading];
  interleaveRemainder(pages, result);

  const tail = result.slice(leading.length);
  shuffleInPlace(tail);
  return [...leading, ...tail];
}
