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
