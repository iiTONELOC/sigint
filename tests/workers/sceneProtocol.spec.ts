import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  createSceneDataCommand,
  parseSceneDataCommand,
  SceneDataCommandType,
  SceneDataProtocolVersion,
} from "@/workers/render/sceneProtocol";

enum MalformedSceneCommandType {
  LegacyData = "data",
}

describe("scene data protocol", () => {
  test("accepts a versioned transferable source patch", () => {
    const command = createSceneDataCommand(
      {
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Aircraft,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["A1"],
        entityIds: ["A1"],
        positions: new Float64Array([10, 20]),
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
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
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Aircraft,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["A1"],
        entityIds: ["A1"],
        positions: new Float64Array(),
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
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
        protocolVersion: SceneDataProtocolVersion.Current,
        sessionId: "session-1",
        sequence: 1,
        type: MalformedSceneCommandType.LegacyData,
        data: [],
      }),
    ).toBeNull();
  });

  test("accepts unique source search handles", () => {
    const command = createSceneDataCommand(
      {
        type: SceneDataCommandType.SourceSearch,
        source: Domain.Earthquake,
        searchRevision: 1,
        active: true,
        handles: new Uint32Array([1, 3]),
      },
      "session-1",
      2,
    );

    expect(parseSceneDataCommand(command)).toEqual(command);
    expect(
      parseSceneDataCommand({
        ...command,
        handles: new Uint32Array([1, 1]),
      }),
    ).toBeNull();
  });
});
