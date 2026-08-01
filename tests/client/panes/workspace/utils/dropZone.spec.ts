import { describe, expect, test } from "bun:test";
import {
  PaneDropZone,
  paneDropZoneForPoint,
  type PaneDropBounds,
} from "@/panes/workspace";

enum PaneDropBoundsFixture {
  Height = 200,
  Left = 0,
  Top = 10,
  Width = 100,
}

enum PaneDropPosition {
  Center = 0.5,
  End = 0.9,
  Start = 0.1,
}

const BOUNDS: PaneDropBounds = {
  height: PaneDropBoundsFixture.Height,
  left: PaneDropBoundsFixture.Left,
  top: PaneDropBoundsFixture.Top,
  width: PaneDropBoundsFixture.Width,
};

function zoneAt(
  xPosition: PaneDropPosition,
  yPosition: PaneDropPosition,
) {
  return paneDropZoneForPoint(
    BOUNDS.left + BOUNDS.width * xPosition,
    BOUNDS.top + BOUNDS.height * yPosition,
    BOUNDS,
  );
}

describe("paneDropZoneForPoint", () => {
  test("classifies every edge zone", () => {
    expect(
      zoneAt(PaneDropPosition.Center, PaneDropPosition.Start),
    ).toBe(PaneDropZone.Top);
    expect(
      zoneAt(PaneDropPosition.Center, PaneDropPosition.End),
    ).toBe(PaneDropZone.Bottom);
    expect(
      zoneAt(PaneDropPosition.Start, PaneDropPosition.Center),
    ).toBe(PaneDropZone.Left);
    expect(
      zoneAt(PaneDropPosition.End, PaneDropPosition.Center),
    ).toBe(PaneDropZone.Right);
  });

  test("classifies the center zone", () => {
    expect(
      zoneAt(PaneDropPosition.Center, PaneDropPosition.Center),
    ).toBe(PaneDropZone.Center);
  });
});
