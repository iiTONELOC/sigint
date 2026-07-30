import { DatasetPatchKind } from "@/workers/data/datasetStore";
import type { RenderSourceId } from "@/workers/data/sourceIds";
import {
  SceneDataCommandType,
  SceneDataProtocolVersion,
  type SceneSourceCommand,
} from "@/workers/render/sceneProtocol";
import type { RenderSceneView } from "@/workers/render/sceneStore";

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
    deletedHandles: new Uint32Array(),
  };
}
