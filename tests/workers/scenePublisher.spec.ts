import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import { ScenePublisher } from "@/workers/data/render-codecs/scenePublisher";
import {
  SceneDataCommandType,
  SceneGeometryKind,
} from "@/workers/render/sceneProtocol";

describe("scene publisher", () => {
  test("binds and transfers typed source patches in sequence", () => {
    const messages: unknown[] = [];
    const transfers: (readonly Transferable[])[] = [];
    const publisher = new ScenePublisher();
    publisher.connect({
      postMessage: (message, transfer = []) => {
        messages.push(message);
        transfers.push(transfer);
      },
    }, "session-a");

    publisher.publish({
      type: SceneDataCommandType.SourcePatch,
      source: Domain.Aircraft,
      sourceVersion: 1,
      kind: DatasetPatchKind.Rebase,
      handles: new Uint32Array([1]),
      sceneIds: ["A1"],
      entityIds: ["A1"],
      positions: new Float64Array([20, 10]),
      motionPositions: new Float64Array(),
      motionPositionStride: 0,
      unitVectors: new Float32Array([1, 0, 0]),
      timestamps: new Float64Array([100]),
      attributes: new Float32Array([90]),
      attributeStride: 1,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: 0,
      dictionaryStart: 0,
      dictionaryValues: [],
      geometryKinds: new Uint8Array([SceneGeometryKind.None]),
      geometryCoordinates: new Float64Array(),
      geometryPartEnds: new Uint32Array(),
      geometryGroupEnds: new Uint32Array(),
      geometryRecordEnds: new Uint32Array([0]),
      deletedHandles: new Uint32Array(),
    });
    publisher.publish({
      type: SceneDataCommandType.SourceSearch,
      source: Domain.Aircraft,
      searchRevision: 1,
      active: true,
      handles: new Uint32Array([1]),
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({
      type: SceneDataCommandType.Bind,
      sequence: 1,
      sessionId: "session-a",
    });
    expect(messages[1]).toMatchObject({
      type: SceneDataCommandType.SourcePatch,
      source: Domain.Aircraft,
      sequence: 2,
      sessionId: "session-a",
    });
    expect(transfers[1]).toHaveLength(13);
    expect(messages[2]).toMatchObject({
      type: SceneDataCommandType.SourceSearch,
      source: Domain.Aircraft,
      sequence: 3,
      sessionId: "session-a",
    });
    expect(transfers[2]).toHaveLength(1);
  });
});
