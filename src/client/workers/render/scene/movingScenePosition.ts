import {
  TRAIL_POLICY,
  type TrackSource,
} from "@/lib/geo/trails/trailStore";
import {
  getPointSourceDefinition,
  motionAttributeOffsetForSource,
} from "@shared/domain/pointSource";
import {
  advanceGeographicMotion,
  advanceUnitMotion,
  createGeographicMotion,
  type GeographicMotion,
} from "@/lib/geo/unitSphere";
import {
  MOVING_SCENE_ATTRIBUTE_COUNT,
  SCENE_POSITION_COUNT,
  MovingSceneAttribute,
  ScenePositionOffset,
} from "@shared/scene";
import {
  scenePositionFromRecord,
  scenePositionFromView,
  type ScenePositionAccessor,
  type SceneResolvedPosition,
} from "@/workers/render/scene/scenePosition";
import type {
  RenderSceneRecord,
  RenderSceneView,
} from "@/workers/render/sceneStore";
import { MS_PER_SECOND } from "@shared/time";

export type MovingScenePositionOptions = Readonly<{
  attributeOffset: number;
  attributeStride: number;
  maximumAgeMs: number;
}>;

type SceneMotionInput = Readonly<{
  directionDegrees: number;
  latitude: number;
  longitude: number;
  sceneId: string;
  speedMetersPerSecond: number;
  timestamp: number;
}>;

type CachedSceneMotion = SceneMotionInput &
  Readonly<{ motion: GeographicMotion }>;

export class MovingScenePositionAccessor
  implements ScenePositionAccessor
{
  private readonly options: MovingScenePositionOptions;
  private recordCache: CachedSceneMotion | null = null;
  private viewCache: (CachedSceneMotion | null)[] = [];

  constructor(options: MovingScenePositionOptions) {
    this.options = options;
  }

  resolveRecord(
    record: RenderSceneRecord,
    time: number,
  ): SceneResolvedPosition {
    const raw = scenePositionFromRecord(record);
    const input = this.recordInput(record);
    if (!input) return raw;
    const elapsedSeconds = this.interpolationSeconds(input, time);
    if (elapsedSeconds === null) return raw;
    const cached = this.cachedMotion(input, this.recordCache);
    this.recordCache = cached;
    return this.advance(cached.motion, elapsedSeconds);
  }

  resolveView(
    view: RenderSceneView,
    index: number,
    time: number,
  ): SceneResolvedPosition | null {
    const raw = scenePositionFromView(view, index);
    if (!raw) return null;
    const input = this.viewInput(view, index);
    if (!input) return raw;
    const elapsedSeconds = this.interpolationSeconds(input, time);
    if (elapsedSeconds === null) return raw;
    const cached = this.cachedMotion(
      input,
      this.viewCache[index] ?? null,
    );
    this.viewCache[index] = cached;
    return this.advance(cached.motion, elapsedSeconds);
  }

  hasFrameMotion(view: RenderSceneView): boolean {
    for (let index = 0; index < view.capacity; index++) {
      if (this.hasMotionAt(view, index)) return true;
    }
    return false;
  }

  hasMotionAt(view: RenderSceneView, index: number): boolean {
    return (
      view.active[index] === 1 &&
      (view.timestamps[index] ?? 0) > 0 &&
      this.hasCompatibleSchema(
        view.attributeStride,
        view.motionPositionStride,
      )
    );
  }

  private interpolationSeconds(
    input: SceneMotionInput,
    time: number,
  ): number | null {
    const elapsedMilliseconds = time - input.timestamp;
    if (
      input.speedMetersPerSecond <= 0 ||
      elapsedMilliseconds < MS_PER_SECOND
    ) {
      return null;
    }
    return (
      Math.min(elapsedMilliseconds, this.options.maximumAgeMs) /
      MS_PER_SECOND
    );
  }

  private advance(
    motion: GeographicMotion,
    elapsedSeconds: number,
  ): SceneResolvedPosition {
    const geographic = advanceGeographicMotion(
      motion,
      elapsedSeconds,
    );
    const unit = advanceUnitMotion(motion, elapsedSeconds);
    return {
      latitude: geographic.latitude,
      longitude: geographic.longitude,
      unitX: unit.x,
      unitY: unit.y,
      unitZ: unit.z,
      interpolated: true,
    };
  }

  private cachedMotion(
    input: SceneMotionInput,
    cached: CachedSceneMotion | null,
  ): CachedSceneMotion {
    if (
      cached?.sceneId === input.sceneId &&
      cached.timestamp === input.timestamp &&
      cached.latitude === input.latitude &&
      cached.longitude === input.longitude &&
      cached.directionDegrees === input.directionDegrees &&
      cached.speedMetersPerSecond === input.speedMetersPerSecond
    ) {
      return cached;
    }
    const motion = createGeographicMotion(
      input.latitude,
      input.longitude,
      input.directionDegrees,
      input.speedMetersPerSecond,
    );
    return {
      sceneId: input.sceneId,
      timestamp: input.timestamp,
      latitude: input.latitude,
      longitude: input.longitude,
      directionDegrees: input.directionDegrees,
      speedMetersPerSecond: input.speedMetersPerSecond,
      motion,
    };
  }

  private recordInput(
    record: RenderSceneRecord,
  ): SceneMotionInput | null {
    if (
      !this.hasCompatibleAttributes(record.attributes.length) ||
      record.motionLatitude === null ||
      record.motionLongitude === null
    ) {
      return null;
    }
    return this.input(
      record.sceneId,
      record.timestamp,
      record.motionLatitude,
      record.motionLongitude,
      record.attributes,
      this.options.attributeOffset,
    );
  }

  private viewInput(
    view: RenderSceneView,
    index: number,
  ): SceneMotionInput | null {
    const sceneId = view.sceneIds[index];
    const timestamp = view.timestamps[index];
    if (
      !sceneId ||
      timestamp === undefined ||
      !this.hasCompatibleSchema(
        view.attributeStride,
        view.motionPositionStride,
      )
    ) {
      return null;
    }
    const motionPositionOffset =
      index * view.motionPositionStride;
    const longitude =
      view.motionPositions[
        motionPositionOffset + ScenePositionOffset.Longitude
      ];
    const latitude =
      view.motionPositions[
        motionPositionOffset + ScenePositionOffset.Latitude
      ];
    if (longitude === undefined || latitude === undefined) return null;
    return this.input(
      sceneId,
      timestamp,
      latitude,
      longitude,
      view.attributes,
      index * view.attributeStride + this.options.attributeOffset,
    );
  }

  private input(
    sceneId: string,
    timestamp: number,
    latitude: number,
    longitude: number,
    attributes: ArrayLike<number>,
    offset: number,
  ): SceneMotionInput | null {
    const directionDegrees =
      attributes[offset + MovingSceneAttribute.DirectionDegrees];
    const speedMetersPerSecond =
      attributes[offset + MovingSceneAttribute.SpeedMetersPerSecond];
    if (
      directionDegrees === undefined ||
      speedMetersPerSecond === undefined ||
      !Number.isFinite(timestamp) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(directionDegrees) ||
      !Number.isFinite(speedMetersPerSecond)
    ) {
      return null;
    }
    return {
      directionDegrees,
      latitude,
      longitude,
      sceneId,
      speedMetersPerSecond,
      timestamp,
    };
  }

  private hasCompatibleAttributes(attributeStride: number): boolean {
    return (
      attributeStride === this.options.attributeStride &&
      this.options.attributeOffset +
        MOVING_SCENE_ATTRIBUTE_COUNT <=
        attributeStride
    );
  }

  private hasCompatibleSchema(
    attributeStride: number,
    motionPositionStride: number,
  ): boolean {
    return (
      this.hasCompatibleAttributes(attributeStride) &&
      motionPositionStride ===
        SCENE_POSITION_COUNT
    );
  }
}

/** The position accessor a moving source layer projects through. */
export function movingPositionAccessor(
  source: TrackSource,
): MovingScenePositionAccessor {
  return new MovingScenePositionAccessor({
    attributeOffset: motionAttributeOffsetForSource(source),
    attributeStride:
      getPointSourceDefinition(source).sceneSchema.attributeStride,
    maximumAgeMs: TRAIL_POLICY[source].maxExtrapolationMs,
  });
}
