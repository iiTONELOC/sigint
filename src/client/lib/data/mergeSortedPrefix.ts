export function mergeSortedPrefix<T>(
  left: readonly T[],
  right: readonly T[],
  compare: (left: T, right: T) => number,
  limit: number,
): T[] {
  const merged: T[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (
    merged.length < limit &&
    (leftIndex < left.length || rightIndex < right.length)
  ) {
    const leftItem = left[leftIndex];
    const rightItem = right[rightIndex];
    if (
      leftItem !== undefined &&
      (rightItem === undefined || compare(leftItem, rightItem) <= 0)
    ) {
      merged.push(leftItem);
      leftIndex += 1;
    } else if (rightItem !== undefined) {
      merged.push(rightItem);
      rightIndex += 1;
    }
  }
  return merged;
}

export function mergeSortedPrefixes<T>(
  sources: readonly (readonly T[])[],
  compare: (left: T, right: T) => number,
  limit: number,
): T[] {
  const merged: T[] = [];
  const indexes = new Uint32Array(sources.length);
  while (merged.length < limit) {
    let selectedSource = -1;
    let selected: T | undefined;
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
      const source = sources[sourceIndex];
      const item = source?.[indexes[sourceIndex] ?? 0];
      if (
        item !== undefined &&
        (selected === undefined || compare(item, selected) < 0)
      ) {
        selected = item;
        selectedSource = sourceIndex;
      }
    }
    if (selected === undefined || selectedSource < 0) break;
    merged.push(selected);
    indexes[selectedSource] = (indexes[selectedSource] ?? 0) + 1;
  }
  return merged;
}
