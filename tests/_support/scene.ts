import { DatasetPatchKind } from "@/workers/data/datasetStore";
import type { RenderSourceId } from "@/workers/data/sourceIds";
import {
  SceneDataCommandType,
  SceneDataProtocolVersion,
  type SceneSearchCommand,
  type SceneSourceCommand,
} from "@/workers/render/sceneProtocol";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import type { GeoMultiPolygon } from "@shared/geo";

enum TestGeometryComponentCount {
  Position = 2,
}

type TestGeometryBuffers = Readonly<{
  geometryCoordinates: Float64Array<ArrayBuffer>;
  geometryRingEnds: Uint32Array<ArrayBuffer>;
  geometryPolygonEnds: Uint32Array<ArrayBuffer>;
  geometryRecordEnds: Uint32Array<ArrayBuffer>;
}>;

function testGeometryBuffers(
  geometries: readonly (GeoMultiPolygon | null)[],
): TestGeometryBuffers {
  const coordinates: number[] = [];
  const ringEnds: number[] = [];
  const polygonEnds: number[] = [];
  const recordEnds: number[] = [];
  for (const geometry of geometries) {
    if (geometry) {
      for (const polygon of geometry) {
        for (const ring of polygon) {
          for (const point of ring) coordinates.push(...point);
          ringEnds.push(
            coordinates.length / TestGeometryComponentCount.Position,
          );
        }
        polygonEnds.push(ringEnds.length);
      }
    }
    recordEnds.push(polygonEnds.length);
  }
  return {
    geometryCoordinates: new Float64Array(coordinates),
    geometryRingEnds: new Uint32Array(ringEnds),
    geometryPolygonEnds: new Uint32Array(polygonEnds),
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
    protocolVersion: SceneDataProtocolVersion.Current,
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
    protocolVersion: SceneDataProtocolVersion.Current,
    sessionId: "scene-layer-test",
    sequence: 2,
    source,
    searchRevision,
    active,
    handles: new Uint32Array(handles),
  };
}
