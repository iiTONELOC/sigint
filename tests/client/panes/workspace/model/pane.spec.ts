import { describe, expect, test } from "bun:test";
import {
  PaneDropZone,
  PaneDragDataType,
  PaneDragEffect,
  PaneIdSequence,
  PaneIdToken,
  PaneLayoutRatio,
  PaneMobileHeight,
  PaneMobileRatio,
  PaneNodeType,
  PaneResizeMetric,
  PaneType,
  PaneTreeArity,
  PaneWorkspaceIconMetric,
  PaneWorkspaceMenuMetric,
  SplitDirection,
} from "@/panes/workspace/model";

enum PaneModelCount {
  One = 1,
  Two = 2,
  Three = 3,
  Five = 5,
  Seven = 7,
  Eight = 8,
}

function expectUniqueNumbers(
  values: readonly number[],
  expectedCount: PaneModelCount,
): void {
  expect(values).toHaveLength(expectedCount);
  expect(new Set(values).size).toBe(expectedCount);
}

function expectUniqueStrings(
  values: readonly string[],
  expectedCount: PaneModelCount,
): void {
  expect(values).toHaveLength(expectedCount);
  expect(new Set(values).size).toBe(expectedCount);
}

describe("pane workspace model", () => {
  test("owns eight unique pane identities", () => {
    expectUniqueStrings(
      Object.values(PaneType),
      PaneModelCount.Eight,
    );
  });

  test("owns unique node and direction identities", () => {
    expectUniqueStrings(
      Object.values(PaneNodeType),
      PaneModelCount.Two,
    );
    expectUniqueStrings(
      Object.values(SplitDirection),
      PaneModelCount.Two,
    );
  });

  test("owns five unique drop zones", () => {
    expectUniqueStrings(
      Object.values(PaneDropZone),
      PaneModelCount.Five,
    );
  });

  test("owns unique layout ratios", () => {
    const ratios = Object.values(PaneLayoutRatio).filter(
      (value): value is number => typeof value === "number",
    );
    expect(ratios).toHaveLength(PaneModelCount.Three);
    expect(new Set(ratios).size).toBe(PaneModelCount.Three);
  });

  test("owns unique workspace icon metrics", () => {
    const metrics = Object.values(PaneWorkspaceIconMetric).filter(
      (value): value is number => typeof value === "number",
    );
    expectUniqueNumbers(metrics, PaneModelCount.Eight);
    const menuMetrics = Object.values(PaneWorkspaceMenuMetric).filter(
      (value): value is number => typeof value === "number",
    );
    expectUniqueNumbers(menuMetrics, PaneModelCount.One);
  });

  test("owns unique mobile pane height policy", () => {
    const heights = Object.values(PaneMobileHeight).filter(
      (value): value is number => typeof value === "number",
    );
    const ratios = Object.values(PaneMobileRatio).filter(
      (value): value is number => typeof value === "number",
    );
    expectUniqueNumbers(heights, PaneModelCount.Eight);
    expectUniqueNumbers(ratios, PaneModelCount.One);
  });

  test("owns pane tree identity and shape values", () => {
    const sequence = Object.values(PaneIdSequence).filter(
      (value): value is number => typeof value === "number",
    );
    const arity = Object.values(PaneTreeArity).filter(
      (value): value is number => typeof value === "number",
    );
    expectUniqueNumbers(sequence, PaneModelCount.Two);
    expectUniqueNumbers(arity, PaneModelCount.One);
    expectUniqueStrings(
      Object.values(PaneIdToken),
      PaneModelCount.Two,
    );
    expectUniqueStrings(
      Object.values(PaneDragDataType),
      PaneModelCount.One,
    );
    expectUniqueStrings(
      Object.values(PaneDragEffect),
      PaneModelCount.One,
    );
  });

  test("owns unique resize control policy", () => {
    const metrics = Object.values(PaneResizeMetric).filter(
      (value): value is number => typeof value === "number",
    );
    expectUniqueNumbers(metrics, PaneModelCount.Seven);
  });
});
