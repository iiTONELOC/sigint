import { describe, expect, test } from "bun:test";
import {
  TRAIL_POLICY,
} from "@/lib/geo/trails/trailStore";
import {
  advanceGeographicMotion,
  advanceUnitMotion,
  createGeographicMotion,
  geographicToUnitVector,
} from "@/lib/geo/unitSphere";
import {
  MovingScenePositionAccessor,
} from "@/workers/render/scene/movingScenePosition";
import {
  MOVING_SCENE_ATTRIBUTE_COUNT,
  SCENE_POSITION_COUNT,
} from "@shared/scene";
import type {
  RenderSceneView,
} from "@/workers/render/sceneStore";
import { Domain } from "@shared/domain/identity";
import { MS_PER_SECOND } from "@shared/time";

type MovingViewOptions = Readonly<{
  active?: number;
  directionDegrees?: number;
  motionLatitude?: number;
  motionLongitude?: number;
  rawLatitude?: number;
  rawLongitude?: number;
  sceneId?: string;
  speedMetersPerSecond?: number;
  timestamp?: number;
}>;

function movingView(
  options: MovingViewOptions = {},
): RenderSceneView {
  const {
    active = 1,
    directionDegrees = 90,
    motionLatitude = 0,
    motionLongitude = 0,
    rawLatitude = 10,
    rawLongitude = 20,
    sceneId = "moving-a",
    speedMetersPerSecond = 1_000,
    timestamp = 1_000,
  } = options;
  const unit = geographicToUnitVector(
    rawLatitude,
    rawLongitude,
  );
  return {
    capacity: 1,
    active: new Uint8Array([active]),
    sceneIds: [sceneId],
    entityIds: [sceneId],
    positions: new Float64Array([
      rawLongitude,
      rawLatitude,
    ]),
    motionPositions: new Float64Array([
      motionLongitude,
      motionLatitude,
    ]),
    motionPositionStride:
      SCENE_POSITION_COUNT,
    unitVectors: new Float32Array([unit.x, unit.y, unit.z]),
    timestamps: new Float64Array([timestamp]),
    attributes: new Float32Array([
      directionDegrees,
      speedMetersPerSecond,
    ]),
    attributeStride: MOVING_SCENE_ATTRIBUTE_COUNT,
    stringAttributes: new Uint32Array(),
    stringAttributeStride: 0,
    dictionary: [],
    geometries: [null],
  };
}

function movingAccessor(
  source: Domain.Aircraft | Domain.Ships,
): MovingScenePositionAccessor {
  return new MovingScenePositionAccessor({
    attributeOffset: 0,
    attributeStride: MOVING_SCENE_ATTRIBUTE_COUNT,
    maximumAgeMs: TRAIL_POLICY[source].maxExtrapolationMs,
  });
}

function expectMaximumAgeBoundary(
  source: Domain.Aircraft | Domain.Ships,
): void {
  const view = movingView();
  const accessor = movingAccessor(source);
  const maximumAge = TRAIL_POLICY[source].maxExtrapolationMs;
  const atMaximum = accessor.resolveView(
    view,
    0,
    1_000 + maximumAge,
  );
  const afterMaximum = accessor.resolveView(
    view,
    0,
    1_000 + maximumAge + 1,
  );

  expect(atMaximum).toMatchObject({ interpolated: true });
  expect(afterMaximum).toEqual(atMaximum);
}

describe("MovingScenePositionAccessor", () => {
  test("advances geographic and unit positions inside the main age window", () => {
    const view = movingView();
    const accessor = movingAccessor(Domain.Aircraft);
    const motion = createGeographicMotion(0, 0, 90, 1_000);
    const geographic = advanceGeographicMotion(motion, 1);
    const unit = advanceUnitMotion(motion, 1);

    expect(accessor.resolveView(
      view,
      0,
      1_000 + MS_PER_SECOND,
    )).toEqual({
      latitude: geographic.latitude,
      longitude: geographic.longitude,
      unitX: unit.x,
      unitY: unit.y,
      unitZ: unit.z,
      interpolated: true,
    });
    expect(accessor.hasFrameMotion(view)).toBe(true);
  });

  test("uses the raw position before motion starts or when motion is invalid", () => {
    const view = movingView();
    const accessor = movingAccessor(Domain.Aircraft);
    const raw = accessor.resolveView(view, 0, 1_999);

    expect(raw).toMatchObject({
      latitude: 10,
      longitude: 20,
      interpolated: false,
    });
    expect(accessor.resolveView(view, 0, 999)).toEqual(raw);
    expect(
      accessor.resolveView(
        movingView({ speedMetersPerSecond: 0 }),
        0,
        1_000 + MS_PER_SECOND,
      ),
    ).toMatchObject({
      latitude: 10,
      longitude: 20,
      interpolated: false,
    });
    expect(
      accessor.resolveView(
        movingView({ motionLatitude: Number.NaN }),
        0,
        1_000 + MS_PER_SECOND,
      ),
    ).toEqual(raw);
  });

  test("holds active aircraft and ships at their maximum projection", () => {
    expectMaximumAgeBoundary(Domain.Aircraft);
    expectMaximumAgeBoundary(Domain.Ships);
  });

  test("refreshes cached motion after a patch or handle reuse", () => {
    const accessor = movingAccessor(Domain.Aircraft);
    const east = createGeographicMotion(0, 0, 90, 1_000);
    const north = createGeographicMotion(1, 2, 0, 500);

    expect(
      accessor.resolveView(movingView(), 0, 2_000),
    ).toMatchObject(
      advanceGeographicMotion(east, 1),
    );
    expect(
      accessor.resolveView(
        movingView({
          directionDegrees: 0,
          motionLatitude: 1,
          motionLongitude: 2,
          sceneId: "moving-b",
          speedMetersPerSecond: 500,
        }),
        0,
        2_000,
      ),
    ).toMatchObject(
      advanceGeographicMotion(north, 1),
    );
  });

  test("schedules frames only for active retained motion", () => {
    const accessor = movingAccessor(Domain.Aircraft);

    expect(accessor.hasFrameMotion(movingView())).toBe(true);
    expect(
      accessor.hasFrameMotion(
        movingView({ speedMetersPerSecond: 0 }),
      ),
    ).toBe(true);
    expect(
      accessor.hasFrameMotion(movingView({ active: 0 })),
    ).toBe(false);
    expect(
      accessor.hasFrameMotion(movingView({ timestamp: 0 })),
    ).toBe(false);
  });
});
