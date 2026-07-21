import { describe, expect, test } from "bun:test";
import { createScenePublisher } from "@/workers/data/render-codecs/scenePublisher";

describe("scene publisher", () => {
  test("binds and transfers typed source patches in sequence", () => {
    const messages: unknown[] = [];
    const transfers: (readonly Transferable[])[] = [];
    const publisher = createScenePublisher();
    publisher.connect({
      postMessage: (message, transfer = []) => {
        messages.push(message);
        transfers.push(transfer);
      },
    }, "session-a");

    publisher.publish({
      type: "sourcePatch",
      source: "aircraft",
      sourceVersion: 1,
      kind: "rebase",
      handles: new Uint32Array([1]),
      ids: ["A1"],
      positions: new Float32Array([20, 10]),
      unitVectors: new Float32Array([1, 0, 0]),
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
      type: "bind",
      sequence: 1,
      sessionId: "session-a",
    });
    expect(messages[1]).toMatchObject({
      type: "sourcePatch",
      source: "aircraft",
      sequence: 2,
      sessionId: "session-a",
    });
    expect(transfers[1]).toHaveLength(6);
  });
});
