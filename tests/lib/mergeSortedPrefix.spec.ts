import { describe, expect, test } from "bun:test";
import { mergeSortedPrefixes } from "@/lib/data/mergeSortedPrefix";

describe("mergeSortedPrefixes", () => {
  test("merges a bounded prefix from every sorted source", () => {
    expect(
      mergeSortedPrefixes(
        [[1, 4, 7], [2, 5, 8], [3, 6, 9]],
        (left, right) => left - right,
        7,
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
