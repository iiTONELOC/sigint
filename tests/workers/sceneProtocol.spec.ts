import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  createSceneDataCommand,
  parseSceneDataCommand,
  SceneDataCommandType,
  SceneDataProtocolVersion,
  SceneGeometryKind,
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
        geometryKinds: new Uint8Array([SceneGeometryKind.Polygon]),
        geometryCoordinates: new Float64Array([
          0, 0, 10, 0, 10, 10, 0, 10, 0, 0,
          2, 2, 2, 4, 4, 4, 4, 2, 2, 2,
        ]),
        geometryPartEnds: new Uint32Array([5, 10]),
        geometryGroupEnds: new Uint32Array([2]),
        geometryRecordEnds: new Uint32Array([1]),
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
        geometryKinds: new Uint8Array([SceneGeometryKind.None]),
        geometryCoordinates: new Float64Array(),
        geometryPartEnds: new Uint32Array(),
        geometryGroupEnds: new Uint32Array(),
        geometryRecordEnds: new Uint32Array([0]),
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

  test("rejects geometry with broken topology", () => {
    const command = createSceneDataCommand(
      {
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Weather,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["weather-area"],
        entityIds: ["weather-area"],
        positions: new Float64Array([5, 5]),
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
        attributes: new Float32Array(),
        attributeStride: 0,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        geometryKinds: new Uint8Array([SceneGeometryKind.Polygon]),
        geometryCoordinates: new Float64Array([
          0, 0, 10, 0, 10, 10, 0, 0,
        ]),
        geometryPartEnds: new Uint32Array([4]),
        geometryGroupEnds: new Uint32Array([2]),
        geometryRecordEnds: new Uint32Array([1]),
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand(command)).toBeNull();
  });

  test("rejects an open geometry ring", () => {
    const command = createSceneDataCommand(
      {
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Weather,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["weather-area"],
        entityIds: ["weather-area"],
        positions: new Float64Array([5, 5]),
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
        attributes: new Float32Array(),
        attributeStride: 0,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        geometryKinds: new Uint8Array([SceneGeometryKind.Polygon]),
        geometryCoordinates: new Float64Array([
          0, 0, 10, 0, 10, 10, 0, 10, 1, 1,
        ]),
        geometryPartEnds: new Uint32Array([5]),
        geometryGroupEnds: new Uint32Array([1]),
        geometryRecordEnds: new Uint32Array([1]),
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand(command)).toBeNull();
  });

  test("accepts an open polyline with two points", () => {
    const command = createSceneDataCommand(
      {
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Cyclones,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["cyclone-path"],
        entityIds: ["cyclone"],
        positions: new Float64Array([-75, 25]),
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
        attributes: new Float32Array(),
        attributeStride: 0,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        geometryKinds: new Uint8Array([SceneGeometryKind.Polyline]),
        geometryCoordinates: new Float64Array([
          -75, 25, -74, 26,
        ]),
        geometryPartEnds: new Uint32Array([2]),
        geometryGroupEnds: new Uint32Array([1]),
        geometryRecordEnds: new Uint32Array([1]),
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand(command)).toEqual(command);
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
