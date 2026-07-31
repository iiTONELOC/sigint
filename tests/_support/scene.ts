import { DatasetPatchKind } from "@/workers/data/datasetStore";
import type { RenderSourceId } from "@/workers/data/sourceIds";
import {
  SceneDataCommandType,
  SceneGeometryKind,
  SceneProtocolVersion,
  type SceneSearchCommand,
  type SceneSourceCommand,
} from "@/workers/render/sceneProtocol";
import type {
  RenderSceneGeometry,
  RenderSceneView,
} from "@/workers/render/sceneStore";

enum TestGeometryComponentCount {
  Position = 2,
}

type TestGeometryBuffers = Readonly<{
  geometryKinds: Uint8Array<ArrayBuffer>;
  geometryCoordinates: Float64Array<ArrayBuffer>;
  geometryPartEnds: Uint32Array<ArrayBuffer>;
  geometryGroupEnds: Uint32Array<ArrayBuffer>;
  geometryRecordEnds: Uint32Array<ArrayBuffer>;
}>;

function testGeometryBuffers(
  geometries: readonly (RenderSceneGeometry | null)[],
): TestGeometryBuffers {
  const kinds: number[] = [];
  const coordinates: number[] = [];
  const partEnds: number[] = [];
  const groupEnds: number[] = [];
  const recordEnds: number[] = [];
  for (const geometry of geometries) {
    kinds.push(geometry?.kind ?? SceneGeometryKind.None);
    if (geometry) {
      for (const group of geometry.groups) {
        for (const part of group) {
          for (const point of part) coordinates.push(...point);
          partEnds.push(
            coordinates.length / TestGeometryComponentCount.Position,
          );
        }
        groupEnds.push(partEnds.length);
      }
    }
    recordEnds.push(groupEnds.length);
  }
  return {
    geometryKinds: new Uint8Array(kinds),
    geometryCoordinates: new Float64Array(coordinates),
    geometryPartEnds: new Uint32Array(partEnds),
    geometryGroupEnds: new Uint32Array(groupEnds),
    geometryRecordEnds: new Uint32Array(recordEnds),
  };
}

export function sceneRebaseCommand(
  source: RenderSourceId,
  view: RenderSceneView &
    Readonly<{
      sceneIds: readonly string[];
      entityIds: readonly string[];
    }>,
): SceneSourceCommand {
  return {
    type: SceneDataCommandType.SourcePatch,
    protocolVersion: SceneProtocolVersion.Current,
    sessionId: "scene-layer-test",
    sequence: 1,
    source,
    sourceVersion: 1,
    kind: DatasetPatchKind.Rebase,
    handles: Uint32Array.from(
      { length: view.capacity },
      (_value, index) => index + 1,
    ),
    sceneIds: view.sceneIds,
    entityIds: view.entityIds,
    positions: view.positions,
    motionPositions: view.motionPositions,
    motionPositionStride: view.motionPositionStride,
    unitVectors: view.unitVectors,
    timestamps: view.timestamps,
    attributes: view.attributes,
    attributeStride: view.attributeStride,
    stringAttributes: view.stringAttributes,
    stringAttributeStride: view.stringAttributeStride,
    dictionaryStart: 0,
    dictionaryValues: view.dictionary,
    ...testGeometryBuffers(view.geometries),
    deletedHandles: new Uint32Array(),
  };
}

export function sceneSearchCommand(
  source: RenderSourceId,
  handles: readonly number[],
  searchRevision: number,
  active = true,
): SceneSearchCommand {
  return {
    type: SceneDataCommandType.SourceSearch,
    protocolVersion: SceneProtocolVersion.Current,
    sessionId: "scene-layer-test",
    sequence: 2,
    source,
    searchRevision,
    active,
    handles: new Uint32Array(handles),
  };
}
