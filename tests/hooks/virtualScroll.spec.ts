import { describe, test, expect } from "bun:test";

describe("virtual scroll calculations", () => {
  const rowHeight = 40;
  const overscan = 6;

  function calc(itemCount: number, scrollTop: number, viewportH: number) {
    const totalHeight = itemCount * rowHeight;
    const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endIdx = Math.min(
      itemCount,
      Math.ceil((scrollTop + viewportH) / rowHeight) + overscan,
    );
    const offsetY = startIdx * rowHeight;
    return { totalHeight, startIdx, endIdx, offsetY };
  }

  test("total height = itemCount * rowHeight", () => {
    expect(calc(100, 0, 400).totalHeight).toBe(4000);
  });
  test("start at top with overscan", () => {
    const r = calc(100, 0, 400);
    expect(r.startIdx).toBe(0);
    expect(r.endIdx).toBe(16);
  });
  test("scrolled down shifts window", () => {
    const r = calc(100, 800, 400);
    expect(r.startIdx).toBe(14);
    expect(r.endIdx).toBe(36);
  });
  test("endIdx capped to itemCount", () => {
    expect(calc(10, 0, 10000).endIdx).toBe(10);
  });
  test("startIdx never negative", () => {
    expect(calc(100, 0, 400).startIdx).toBeGreaterThanOrEqual(0);
  });
  test("offsetY = startIdx * rowHeight", () => {
    const r = calc(100, 800, 400);
    expect(r.offsetY).toBe(r.startIdx * rowHeight);
  });
  test("empty list", () => {
    const r = calc(0, 0, 400);
    expect(r.totalHeight).toBe(0);
    expect(r.startIdx).toBe(0);
    expect(r.endIdx).toBe(0);
  });
});
