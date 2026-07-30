import { describe, test, expect } from "bun:test";
import {
  getFlatMetrics,
  clampFlatPan,
  projGlobe,
  projFlat,
} from "@/components/globe/projection";

describe("getFlatMetrics", () => {
  test("correct dimensions at zoom 1", () => {
    const m = getFlatMetrics(800, 600, 1);
    expect(m.mW).toBeCloseTo(736, 0);
    expect(m.mH).toBeCloseTo(504, 0);
    expect(m.cx).toBeCloseTo(400, 0);
    expect(m.cy).toBeCloseTo(300, 0);
  });
  test("zoom scales dimensions", () => {
    const m = getFlatMetrics(800, 600, 2);
    expect(m.mW).toBeCloseTo(1472, 0);
    expect(m.mH).toBeCloseTo(1008, 0);
  });
  test("pan offsets center", () => {
    const m = getFlatMetrics(800, 600, 1, 50, -30);
    expect(m.cx).toBeCloseTo(450, 0);
    expect(m.cy).toBeCloseTo(270, 0);
  });
});

describe("clampFlatPan", () => {
  test("clamps to zero at zoom 1", () => {
    const cam = { zoomFlat: 1, panX: 100, panY: 100 };
    clampFlatPan(cam, 800, 600);
    expect(cam.panX).toBe(0);
    expect(cam.panY).toBe(0);
  });
  test("allows pan at high zoom", () => {
    const cam = { zoomFlat: 3, panX: 100, panY: 50 };
    clampFlatPan(cam, 800, 600);
    expect(cam.panX).toBeGreaterThan(0);
    expect(cam.panY).toBeGreaterThan(0);
  });
  test("clamps negative pan symmetrically", () => {
    const cam = { zoomFlat: 3, panX: -9999, panY: -9999 };
    clampFlatPan(cam, 800, 600);
    expect(cam.panX).toBeLessThan(0);
    expect(cam.panX).toBeGreaterThan(-9999);
  });
});

describe("projGlobe", () => {
  test("point facing camera projects near center x", () => {
    // x = cx + (-sin(phi)*cos(theta))*r, theta=(lon+180)*PI/180+rotY
    // lon=0,lat=0: phi=PI/2, x=cx-cos(PI+rotY)*r=cx+cos(rotY)*r
    // For x≈cx need cos(rotY)≈0 → rotY=PI/2
    const p = projGlobe(0, 0, 400, 300, 250, Math.PI / 2, 0);
    expect(p.x).toBeCloseTo(400, 0);
  });
  test("front and back have different z", () => {
    const front = projGlobe(0, 0, 400, 300, 250, Math.PI / 2, 0);
    const back = projGlobe(0, 180, 400, 300, 250, Math.PI / 2, 0);
    expect(front.z).not.toBeCloseTo(back.z, 0);
  });
});

describe("projFlat", () => {
  test("0,0 projects to center", () => {
    const p = projFlat(0, 0, 400, 300, 800, 600);
    expect(p.x).toBeCloseTo(400, 0);
    expect(p.y).toBeCloseTo(300, 0);
  });
  test("z is always 1", () => {
    expect(projFlat(45, 90, 400, 300, 800, 600).z).toBe(1);
  });
  test("positive lat projects upward", () => {
    expect(projFlat(45, 0, 400, 300, 800, 600).y).toBeLessThan(300);
  });
  test("positive lon projects rightward", () => {
    expect(projFlat(0, 90, 400, 300, 800, 600).x).toBeGreaterThan(400);
  });
});
