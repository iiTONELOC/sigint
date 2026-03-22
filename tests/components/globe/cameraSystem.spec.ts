import { describe, test, expect, mock } from "bun:test";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CamState, CamTarget } from "@/components/globe/types";

mock.module("@/lib/trailService", () => ({
  getInterpolatedPosition: () => null,
}));

const { updateCamera } = await import("@/components/globe/cameraSystem");

// ── Factories ───────────────────────────────────────────────────────

function makeCam(overrides: Partial<CamState> = {}): CamState {
  return {
    rotY: 0,
    rotX: 0,
    vy: 0,
    zoomGlobe: 1,
    zoomFlat: 1,
    panX: 0,
    panY: 0,
    ...overrides,
  };
}

function makeTarget(overrides: Partial<CamTarget> = {}): CamTarget {
  return {
    rotY: 0,
    rotX: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    active: false,
    lockedId: null,
    ...overrides,
  };
}

function makePoint(overrides: Record<string, any> = {}): DataPoint {
  return {
    id: overrides.id ?? "pt-1",
    type: "aircraft",
    lat: overrides.lat ?? 40.0,
    lon: overrides.lon ?? -74.0,
    timestamp: new Date().toISOString(),
    data: { originCountry: "US", ...(overrides.data ?? {}) },
  } as DataPoint;
}

// ── Auto-rotate ─────────────────────────────────────────────────────

describe("auto-rotate", () => {
  test("globe rotates when shouldRotate is true and not dragging", () => {
    const cam = makeCam({ rotY: 0 });
    const target = makeTarget();
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      false,
      true,
      1.0,
      800,
      600,
    );
    expect(cam.rotY).toBeGreaterThan(0);
  });

  test("globe does NOT rotate when dragging", () => {
    const cam = makeCam({ rotY: 1.0 });
    const target = makeTarget();
    const before = cam.rotY;
    updateCamera(
      cam,
      target,
      { active: true },
      null,
      false,
      true,
      1.0,
      800,
      600,
    );
    expect(cam.rotY).toBe(before);
  });

  test("flat mode does NOT auto-rotate", () => {
    const cam = makeCam({ rotY: 0 });
    const target = makeTarget();
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      true,
      true,
      1.0,
      800,
      600,
    );
    expect(cam.rotY).toBe(0);
  });

  test("rotation speed scales with rotSpeed parameter", () => {
    const cam1 = makeCam({ rotY: 0 });
    const cam2 = makeCam({ rotY: 0 });
    const t1 = makeTarget();
    const t2 = makeTarget();
    updateCamera(cam1, t1, { active: false }, null, false, true, 1.0, 800, 600);
    updateCamera(cam2, t2, { active: false }, null, false, true, 3.0, 800, 600);
    expect(cam2.rotY).toBeGreaterThan(cam1.rotY);
  });
});

// ── Velocity decay ──────────────────────────────────────────────────

describe("velocity decay", () => {
  test("velocity decays by 0.95 factor each frame", () => {
    const cam = makeCam({ vy: 0.1 });
    const target = makeTarget();
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(cam.vy).toBeCloseTo(0.095, 4);
  });

  test("velocity applies to rotY", () => {
    const cam = makeCam({ rotY: 1.0, vy: 0.05 });
    const target = makeTarget();
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(cam.rotY).toBeGreaterThan(1.0);
  });

  test("zero velocity stays zero", () => {
    const cam = makeCam({ vy: 0 });
    const target = makeTarget();
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(cam.vy).toBe(0);
  });
});

// ── rotY wrapping ───────────────────────────────────────────────────

describe("rotY wrapping", () => {
  test("rotY stays in [0, 2π] range", () => {
    const cam = makeCam({ rotY: 100 });
    const target = makeTarget();
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(cam.rotY).toBeGreaterThanOrEqual(0);
    expect(cam.rotY).toBeLessThan(Math.PI * 2);
  });

  test("negative rotY wraps to positive", () => {
    const cam = makeCam({ rotY: -1, vy: 0 });
    const target = makeTarget();
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(cam.rotY).toBeGreaterThanOrEqual(0);
    expect(cam.rotY).toBeLessThan(Math.PI * 2);
  });
});

// ── Target lerp ─────────────────────────────────────────────────────

describe("target lerp", () => {
  test("camera lerps toward active target in globe mode", () => {
    const cam = makeCam({ rotY: 0, rotX: 0, zoomGlobe: 1 });
    const target = makeTarget({
      rotY: 1.0,
      rotX: 0.5,
      zoom: 2.0,
      active: true,
    });
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(cam.rotX).toBeGreaterThan(0);
    expect(cam.zoomGlobe).toBeGreaterThan(1);
  });

  test("camera lerps toward active target in flat mode", () => {
    // Use high zoom so clampFlatPan allows non-zero pan values
    // At zoom=1, mW < W so maxX=0 and pan gets clamped to 0
    const cam = makeCam({ panX: 0, panY: 0, zoomFlat: 3.0 });
    const target = makeTarget({ panX: 100, panY: 50, zoom: 3.0, active: true });
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      true,
      false,
      1.0,
      800,
      600,
    );
    expect(cam.panX).toBeGreaterThan(0);
    expect(cam.panY).toBeGreaterThan(0);
  });

  test("inactive target does NOT move camera", () => {
    const cam = makeCam({ rotY: 1.0, rotX: 0.5 });
    const target = makeTarget({ rotY: 3.0, rotX: 1.5, active: false });
    const beforeX = cam.rotX;
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(cam.rotX).toBe(beforeX);
  });

  test("target deactivates when camera is close enough (no lock)", () => {
    const cam = makeCam({ rotY: 1.0, rotX: 0.5, zoomGlobe: 2.0 });
    const target = makeTarget({
      rotY: 1.0,
      rotX: 0.5,
      zoom: 2.0,
      active: true,
    });
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(target.active).toBe(false);
  });

  test("target stays active when locked on selected item", () => {
    const selected = makePoint({ id: "locked-1", lat: 40, lon: -74 });
    const cam = makeCam({ rotY: 1.0, rotX: 0.5, zoomGlobe: 2.0 });
    const target = makeTarget({
      rotY: 1.0,
      rotX: 0.5,
      zoom: 2.0,
      active: true,
      lockedId: "locked-1",
    });
    updateCamera(
      cam,
      target,
      { active: false },
      selected,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(target.active).toBe(true);
  });
});

// ── Lock-on ─────────────────────────────────────────────────────────

describe("lock-on", () => {
  test("lock clears when selection changes", () => {
    const cam = makeCam();
    const target = makeTarget({ lockedId: "old-id", active: true });
    const newSelected = makePoint({ id: "new-id" });
    updateCamera(
      cam,
      target,
      { active: false },
      newSelected,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(target.lockedId).toBeNull();
    expect(target.active).toBe(false);
  });

  test("lock clears when selection is null", () => {
    const cam = makeCam();
    const target = makeTarget({ lockedId: "some-id", active: true });
    updateCamera(
      cam,
      target,
      { active: false },
      null,
      false,
      false,
      1.0,
      800,
      600,
    );
    expect(target.lockedId).toBeNull();
  });

  test("rotation re-enabled releases lock on globe", () => {
    const selected = makePoint({ id: "locked" });
    const cam = makeCam();
    const target = makeTarget({ lockedId: "locked", active: true });
    updateCamera(
      cam,
      target,
      { active: false },
      selected,
      false,
      true,
      1.0,
      800,
      600,
    );
    expect(target.lockedId).toBeNull();
  });

  test("rotation does NOT release lock in flat mode", () => {
    const selected = makePoint({ id: "locked" });
    const cam = makeCam();
    const target = makeTarget({ lockedId: "locked", active: true });
    updateCamera(
      cam,
      target,
      { active: false },
      selected,
      true,
      true,
      1.0,
      800,
      600,
    );
    expect(target.lockedId).toBe("locked");
  });
});
