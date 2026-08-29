import type {
  RenderSceneRecord,
  RenderSceneView,
} from "@/workers/render/sceneStore";
import {
  SCENE_POSITION_COUNT,
  SCENE_UNIT_VECTOR_COUNT,
  ScenePositionOffset,
  SceneUnitVectorOffset,
} from "@shared/scene";

export type SceneResolvedPosition = Readonly<{
  latitude: number;
  longitude: number;
  unitX: number;
  unitY: number;
  unitZ: number;
  interpolated: boolean;
}>;

export type ScenePositionAccessor = Readonly<{
  resolveRecord: (
    record: RenderSceneRecord,
    time: number,
  ) => SceneResolvedPosition;
  resolveView: (
    view: RenderSceneView,
    index: number,
    time: number,
  ) => SceneResolvedPosition | null;
  hasFrameMotion: (view: RenderSceneView) => boolean;
  hasMotionAt: (view: RenderSceneView, index: number) => boolean;
}>;

export function scenePositionFromRecord(
  record: RenderSceneRecord,
): SceneResolvedPosition {
  return {
    latitude: record.latitude,
    longitude: record.longitude,
    unitX: record.unitX,
    unitY: record.unitY,
    unitZ: record.unitZ,
    interpolated: false,
  };
}

export function scenePositionFromView(
  view: RenderSceneView,
  index: number,
): SceneResolvedPosition | null {
  const positionOffset =
    index * SCENE_POSITION_COUNT;
  const unitOffset =
    index * SCENE_UNIT_VECTOR_COUNT;
  const longitude =
    view.positions[positionOffset + ScenePositionOffset.Longitude];
  const latitude =
    view.positions[positionOffset + ScenePositionOffset.Latitude];
  const unitX =
    view.unitVectors[unitOffset + SceneUnitVectorOffset.X];
  const unitY =
    view.unitVectors[unitOffset + SceneUnitVectorOffset.Y];
  const unitZ =
    view.unitVectors[unitOffset + SceneUnitVectorOffset.Z];
  if (
    longitude === undefined ||
    latitude === undefined ||
    unitX === undefined ||
    unitY === undefined ||
    unitZ === undefined
  ) {
    return null;
  }
  return {
    latitude,
    longitude,
    unitX,
    unitY,
    unitZ,
    interpolated: false,
  };
}
