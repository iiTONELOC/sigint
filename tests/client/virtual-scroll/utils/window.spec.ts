import { describe, expect, test } from "bun:test";
import {
  VirtualScrollPolicy,
  calculateVirtualWindow,
} from "@/virtual-scroll";

enum VirtualWindowFixture {
  ExpectedScrolledEnd = 36,
  ExpectedScrolledStart = 14,
  ExpectedTopEnd = 16,
  ItemCount = 100,
  RowHeight = 40,
  ScrollTop = 800,
  SmallItemCount = 10,
  TallViewport = 10_000,
  TotalHeight = 4_000,
  ViewportHeight = 400,
}

function calculate(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
) {
  return calculateVirtualWindow({
    itemCount,
    overscan: VirtualScrollPolicy.DefaultOverscanRows,
    rowHeight: VirtualWindowFixture.RowHeight,
    scrollTop,
    viewportHeight,
  });
}

describe("calculateVirtualWindow", () => {
  test("calculates the top window and total height", () => {
    const window = calculate(
      VirtualWindowFixture.ItemCount,
      VirtualScrollPolicy.Start,
      VirtualWindowFixture.ViewportHeight,
    );

    expect(window.totalHeight).toBe(VirtualWindowFixture.TotalHeight);
    expect(window.startIdx).toBe(VirtualScrollPolicy.Start);
    expect(window.endIdx).toBe(VirtualWindowFixture.ExpectedTopEnd);
    expect(window.offsetY).toBe(VirtualScrollPolicy.Start);
  });

  test("moves the window with the scroll position", () => {
    const window = calculate(
      VirtualWindowFixture.ItemCount,
      VirtualWindowFixture.ScrollTop,
      VirtualWindowFixture.ViewportHeight,
    );

    expect(window.startIdx).toBe(
      VirtualWindowFixture.ExpectedScrolledStart,
    );
    expect(window.endIdx).toBe(VirtualWindowFixture.ExpectedScrolledEnd);
    expect(window.offsetY).toBe(
      window.startIdx * VirtualWindowFixture.RowHeight,
    );
  });

  test("caps the end index at the item count", () => {
    const window = calculate(
      VirtualWindowFixture.SmallItemCount,
      VirtualScrollPolicy.Start,
      VirtualWindowFixture.TallViewport,
    );

    expect(window.endIdx).toBe(VirtualWindowFixture.SmallItemCount);
  });

  test("returns an empty window for an empty list", () => {
    const window = calculate(
      VirtualScrollPolicy.Start,
      VirtualScrollPolicy.Start,
      VirtualWindowFixture.ViewportHeight,
    );

    expect(window.totalHeight).toBe(VirtualScrollPolicy.Start);
    expect(window.startIdx).toBe(VirtualScrollPolicy.Start);
    expect(window.endIdx).toBe(VirtualScrollPolicy.Start);
    expect(window.offsetY).toBe(VirtualScrollPolicy.Start);
  });
});
