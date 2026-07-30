import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import { ScenePublisher } from "@/workers/data/render-codecs/scenePublisher";
import { SceneDataCommandType } from "@/workers/render/sceneProtocol";

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
      unitVectors: new Float32Array([1, 0, 0]),
      timestamps: new Float64Array([100]),
      attributes: new Float32Array([90]),
      attributeStride: 1,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: 0,
      dictionaryStart: 0,
      dictionaryValues: [],
      deletedHandles: new Uint32Array(),
    });

    expect(messages).toHaveLength(2);
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
    expect(transfers[1]).toHaveLength(7);
  });
});
