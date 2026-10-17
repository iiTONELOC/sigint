import {
  TRAIL_POLICY,
  type TrackSource,
} from "@/lib/geo/trails/trailStore";
import {
  getPointSourceDefinition,
  motionAttributeOffsetForSource,
} from "@shared/domain/pointSource";
import { Domain } from "@shared/domain/identity";
import {
  AIRCRAFT_GLIDE_MAXIMUM_MS,
  STANDARD_TURN_DEGREES_PER_SECOND,
} from "@shared/domain/aircraft";
import {
  advanceGeographicMotion,
  advanceUnitMotion,
  createGeographicMotion,
  geographicToUnitVector,
  type GeographicMotion,
} from "@/lib/geo/unitSphere";
import {
  DEGREES_TO_RADIANS,
  METERS_PER_KM,
  haversineKm,
  shortestTurnDegrees,
} from "@shared/geo";
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
  glides?: boolean;
}>;

type SceneMotionInput = Readonly<{
  directionDegrees: number;
  latitude: number;
  longitude: number;
  sceneId: string;
  speedMetersPerSecond: number;
  timestamp: number;
  turnDegreesPerSecond: number;
  reportGapSeconds: number;
}>;

type DrawnState = {
  latitude: number;
  longitude: number;
  headingDegrees: number;
};

type CachedSceneMotion = SceneMotionInput & {
  readonly motion: GeographicMotion;
  glideFrom: DrawnState | null;
  glideStartedAt: number;
  glideMs: number | null;
  drawn: DrawnState | null;
};

function sameInput(cached: CachedSceneMotion, input: SceneMotionInput): boolean {
  return (
    cached.sceneId === input.sceneId &&
    cached.timestamp === input.timestamp &&
    cached.latitude === input.latitude &&
    cached.longitude === input.longitude &&
    cached.directionDegrees === input.directionDegrees &&
    cached.speedMetersPerSecond === input.speedMetersPerSecond &&
    cached.turnDegreesPerSecond === input.turnDegreesPerSecond &&
    cached.reportGapSeconds === input.reportGapSeconds
  );
}

function resolvedAt(
  latitude: number,
  longitude: number,
  headingDegrees: number | undefined,
): SceneResolvedPosition {
  const unit = geographicToUnitVector(latitude, longitude);
  return {
    latitude,
    longitude,
    unitX: unit.x,
    unitY: unit.y,
    unitZ: unit.z,
    interpolated: true,
    headingDegrees,
  };
}

function advanceMotion(
  motion: GeographicMotion,
  elapsedSeconds: number,
  headingDegrees: number | undefined,
): SceneResolvedPosition {
  const geographic = advanceGeographicMotion(motion, elapsedSeconds);
  const unit = advanceUnitMotion(motion, elapsedSeconds);
  return {
    latitude: geographic.latitude,
    longitude: geographic.longitude,
    unitX: unit.x,
    unitY: unit.y,
    unitZ: unit.z,
    interpolated: true,
    headingDegrees,
  };
}

function advanceTurn(
  input: CachedSceneMotion,
  elapsedSeconds: number,
): SceneResolvedPosition {
  const turnSeconds = Math.min(elapsedSeconds, input.reportGapSeconds);
  const turnDegrees = input.turnDegreesPerSecond * turnSeconds;
  const halfTurnRadians = (turnDegrees * DEGREES_TO_RADIANS) / 2;
  const chordScale = halfTurnRadians === 0 ? 1 : Math.sin(halfTurnRadians) / halfTurnRadians;
  const headingDegrees = input.directionDegrees + turnDegrees;
  const arc = createGeographicMotion(
    input.latitude,
    input.longitude,
    input.directionDegrees + turnDegrees / 2,
    input.speedMetersPerSecond * chordScale,
  );
  const straightSeconds = elapsedSeconds - turnSeconds;
  if (straightSeconds <= 0) return advanceMotion(arc, turnSeconds, headingDegrees);
  const end = advanceGeographicMotion(arc, turnSeconds);
  const straight = createGeographicMotion(
    end.latitude,
    end.longitude,
    headingDegrees,
    input.speedMetersPerSecond,
  );
  return advanceMotion(straight, straightSeconds, headingDegrees);
}

function glideDurationMs(
  from: DrawnState,
  target: SceneResolvedPosition,
  targetHeading: number,
  speedMetersPerSecond: number,
): number {
  const turnMs =
    (Math.abs(shortestTurnDegrees(targetHeading - from.headingDegrees)) /
      STANDARD_TURN_DEGREES_PER_SECOND) *
    MS_PER_SECOND;
  const correctionMeters =
    haversineKm(from.latitude, from.longitude, target.latitude, target.longitude) * METERS_PER_KM;
  const correctionMs = (correctionMeters / speedMetersPerSecond) * MS_PER_SECOND;
  return Math.min(Math.max(turnMs, correctionMs), AIRCRAFT_GLIDE_MAXIMUM_MS);
}

function glided(
  cached: CachedSceneMotion,
  target: SceneResolvedPosition,
  time: number,
): SceneResolvedPosition {
  const from = cached.glideFrom;
  if (!from) return target;
  const targetHeading = target.headingDegrees ?? cached.directionDegrees;
  cached.glideMs ??= glideDurationMs(from, target, targetHeading, cached.speedMetersPerSecond);
  const elapsedMs = time - cached.glideStartedAt;
  if (elapsedMs >= cached.glideMs) {
    cached.glideFrom = null;
    return target;
  }
  const eased = (1 - Math.cos(Math.PI * (elapsedMs / cached.glideMs))) / 2;
  const turn = shortestTurnDegrees(targetHeading - from.headingDegrees);
  const turnRate = Math.max(
    STANDARD_TURN_DEGREES_PER_SECOND,
    Math.abs(turn) / (cached.glideMs / MS_PER_SECOND),
  );
  const maximumTurn = (turnRate * elapsedMs) / MS_PER_SECOND;
  return resolvedAt(
    from.latitude + (target.latitude - from.latitude) * eased,
    shortestTurnDegrees(from.longitude + shortestTurnDegrees(target.longitude - from.longitude) * eased),
    from.headingDegrees + Math.max(-maximumTurn, Math.min(maximumTurn, turn)),
  );
}

function rememberDrawn(cached: CachedSceneMotion, position: SceneResolvedPosition): void {
  const headingDegrees = position.headingDegrees ?? cached.directionDegrees;
  if (!cached.drawn) {
    cached.drawn = { latitude: position.latitude, longitude: position.longitude, headingDegrees };
    return;
  }
  cached.drawn.latitude = position.latitude;
  cached.drawn.longitude = position.longitude;
  cached.drawn.headingDegrees = headingDegrees;
}

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
    const cached = this.cachedMotion(input, this.recordCache, time);
    this.recordCache = cached;
    return this.resolveCached(cached, raw, time);
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
    const cached = this.cachedMotion(
      input,
      this.viewCache[index] ?? null,
      time,
    );
    this.viewCache[index] = cached;
    return this.resolveCached(cached, raw, time);
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

  private resolveCached(
    cached: CachedSceneMotion,
    raw: SceneResolvedPosition,
    time: number,
  ): SceneResolvedPosition {
    const target = this.target(cached, raw, time);
    const position = this.options.glides ? glided(cached, target, time) : target;
    if (this.options.glides) rememberDrawn(cached, position);
    return position;
  }

  private target(
    cached: CachedSceneMotion,
    raw: SceneResolvedPosition,
    time: number,
  ): SceneResolvedPosition {
    const elapsedSeconds = this.interpolationSeconds(cached, time);
    if (elapsedSeconds === null) return raw;
    if (cached.turnDegreesPerSecond === 0 || cached.reportGapSeconds === 0) {
      return advanceMotion(cached.motion, elapsedSeconds, undefined);
    }
    return advanceTurn(cached, elapsedSeconds);
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

  private cachedMotion(
    input: SceneMotionInput,
    cached: CachedSceneMotion | null,
    time: number,
  ): CachedSceneMotion {
    if (cached && sameInput(cached, input)) return cached;
    const continues =
      cached?.sceneId === input.sceneId &&
      cached.speedMetersPerSecond > 0 &&
      input.speedMetersPerSecond > 0 &&
      input.reportGapSeconds > 0;
    return {
      ...input,
      motion: createGeographicMotion(
        input.latitude,
        input.longitude,
        input.directionDegrees,
        input.speedMetersPerSecond,
      ),
      glideFrom: continues ? cached.drawn : null,
      glideStartedAt: time,
      glideMs: null,
      drawn: null,
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
      turnDegreesPerSecond: attributes[offset + MovingSceneAttribute.TurnDegreesPerSecond] ?? 0,
      reportGapSeconds: attributes[offset + MovingSceneAttribute.ReportGapSeconds] ?? 0,
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
    glides: source === Domain.Aircraft,
  });
}
