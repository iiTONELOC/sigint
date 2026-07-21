import { describe, expect, test } from "bun:test";
import {
  createSceneDataCommand,
  parseSceneDataCommand,
} from "@/workers/render/sceneProtocol";

describe("scene data protocol", () => {
  test("accepts a versioned transferable source patch", () => {
    const command = createSceneDataCommand(
      {
        type: "sourcePatch",
        source: "aircraft",
        sourceVersion: 1,
        kind: "rebase",
        handles: new Uint32Array([1]),
        ids: ["A1"],
        positions: new Float32Array([10, 20]),
        unitVectors: new Float32Array([1, 0, 0]),
        attributes: new Float32Array([100, 90]),
        attributeStride: 2,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand(command)).toEqual(command);
  });

  test("rejects malformed buffers and legacy object arrays", () => {
    const malformed = createSceneDataCommand(
      {
        type: "sourcePatch",
        source: "aircraft",
        sourceVersion: 1,
        kind: "rebase",
        handles: new Uint32Array([1]),
        ids: ["A1"],
        positions: new Float32Array(),
        unitVectors: new Float32Array([1, 0, 0]),
        attributes: new Float32Array(),
        attributeStride: 0,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand(malformed)).toBeNull();
    expect(
      parseSceneDataCommand({
        protocolVersion: 1,
        sessionId: "session-1",
        sequence: 1,
        type: "data",
        data: [],
      }),
    ).toBeNull();
  });
});
