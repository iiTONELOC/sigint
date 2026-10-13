import { Placement } from "@/layout-mode/model/layoutMode";
import { describe, expect, test } from "bun:test";
import {
  PaneDragDataType,
  PaneDragEffect,
  PaneIdSequence,
  PaneIdToken,
  PaneLayoutRatio,
  PaneMobileRatio,
  PaneMobileScreen,
  PaneNodeType,
  PaneType,
  PaneTreeArity,
  PaneWorkspaceIconMetric,
  PaneWorkspaceMenuMetric,
  SplitDirection,
} from "@/panes/workspace/model/pane";
import { PaneResizeMetric } from "@/panes/workspace/model/resize";

enum PaneModelCount {
  One = 1,
  Two = 2,
  Three = 3,
  Five = 5,
  Seven = 7,
  Eight = 8,
}

type Distinct = Readonly<{ length: number; unique: number }>;

function distinct(values: ReadonlyArray<string | number>): Distinct {
  return { length: values.length, unique: new Set(values).size };
}

function counted(count: PaneModelCount): Distinct {
  return { length: count, unique: count };
}

function numbersOf(members: Record<string, string | number>): number[] {
  return Object.values(members).filter((value): value is number => typeof value === "number");
}

describe("pane workspace model", () => {
  test("owns distinct identities for panes, nodes, directions and drop zones", () => {
    expect(distinct(Object.values(PaneType))).toEqual(counted(PaneModelCount.Eight));
    expect(distinct(Object.values(PaneNodeType))).toEqual(counted(PaneModelCount.Two));
    expect(distinct(Object.values(SplitDirection))).toEqual(counted(PaneModelCount.Two));
    expect(distinct(Object.values(Placement))).toEqual(counted(PaneModelCount.Five));
  });

  test("owns distinct layout ratios and workspace metrics", () => {
    expect(distinct(numbersOf(PaneLayoutRatio))).toEqual(counted(PaneModelCount.Five));
    expect(distinct(numbersOf(PaneWorkspaceIconMetric))).toEqual(counted(PaneModelCount.Eight));
    expect(distinct(numbersOf(PaneWorkspaceMenuMetric))).toEqual(counted(PaneModelCount.One));
  });

  test("owns the mobile pane height policy once", () => {
    expect(distinct(Object.values(PaneMobileScreen))).toEqual(counted(PaneModelCount.Three));
    expect(distinct(numbersOf(PaneMobileRatio))).toEqual(counted(PaneModelCount.One));
  });

  test("owns the pane tree identity and shape values once", () => {
    expect(distinct(numbersOf(PaneIdSequence))).toEqual(counted(PaneModelCount.Two));
    expect(distinct(numbersOf(PaneTreeArity))).toEqual(counted(PaneModelCount.One));
    expect(distinct(Object.values(PaneIdToken))).toEqual(counted(PaneModelCount.Two));
    expect(distinct(Object.values(PaneDragDataType))).toEqual(counted(PaneModelCount.One));
    expect(distinct(Object.values(PaneDragEffect))).toEqual(counted(PaneModelCount.One));
  });

  test("owns the resize control policy once", () => {
    expect(distinct(numbersOf(PaneResizeMetric))).toEqual(counted(PaneModelCount.Seven));
  });
});
